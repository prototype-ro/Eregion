package io.eregion.explore;

import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.auth.Mailer;
import io.eregion.common.ApiException;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckStats;
import io.eregion.deck.DeckRepository;
import io.eregion.deck.StatsCalculator;
import io.eregion.explore.ExploreRepository.PublicDeck;
import io.eregion.ratelimit.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Decks that people chose to publish. Each shows only the version its owner picked. */
@RestController
@RequestMapping("/api/explore")
public class ExploreController {

	public record PublicDeckDetail(PublicDeck deck, List<DeckCardLine> cards, DeckStats stats) {
	}

	private static final int MAX_PAGE = 48;

	private final ExploreRepository explore;
	private final DeckRepository decks;
	private final RateLimits limits;
	private final Mailer mail;
	private final io.eregion.analysis.AnalysisService analysis;
	/** Who hears about each report. Blank leaves reports in the deck_reports table only. */
	private final String moderationEmail;
	private final String publicUrl;

	public ExploreController(ExploreRepository explore, DeckRepository decks, RateLimits limits, Mailer mail, io.eregion.analysis.AnalysisService analysis,
			@Value("${eregion.moderation.email:}") String moderationEmail, @Value("${eregion.public-url:http://localhost:3000}") String publicUrl) {
		this.explore = explore;
		this.decks = decks;
		this.limits = limits;
		this.mail = mail;
		this.analysis = analysis;
		this.moderationEmail = moderationEmail;
		this.publicUrl = publicUrl;
	}

	@GetMapping
	public List<PublicDeck> search(HttpServletRequest http, @AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID commander,
			@RequestParam(required = false) String q, @RequestParam(required = false) String colors, @RequestParam(required = false) Integer bracket,
			@RequestParam(required = false) Double maxPrice, @RequestParam(defaultValue = "newest") String sort,
			@RequestParam(defaultValue = "24") int limit, @RequestParam(defaultValue = "0") int offset) {
		limits.publicRead(http);
		String text = q == null || q.isBlank() ? null : q.trim().substring(0, Math.min(q.trim().length(), 80));
		// Colours go into a pattern, so only the five colour letters are let through.
		String identity = colors == null ? null : colors.toUpperCase(java.util.Locale.ROOT).replaceAll("[^WUBRG]", "");
		ExploreRepository.Sort order = switch (sort) {
			case "price-low" -> ExploreRepository.Sort.PRICE_LOW;
			case "price-high" -> ExploreRepository.Sort.PRICE_HIGH;
			default -> ExploreRepository.Sort.NEWEST;
		};
		return explore.search(CurrentUser.idOrNull(jwt), commander, text, identity == null || identity.isEmpty() ? null : identity,
				bracket == null || bracket < 1 || bracket > 5 ? null : bracket, maxPrice == null || maxPrice <= 0 ? null : maxPrice, order,
				Math.max(1, Math.min(limit, MAX_PAGE)), Math.max(0, offset));
	}

	public record ReportRequest(@NotBlank @Size(max = 500) String reason) {
	}

	/** Tells the people who run the site about a public deck, for example because it breaks the rules. */
	@PostMapping("/{deckId}/report")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void report(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody ReportRequest request) {
		UUID reporter = CurrentUser.id(jwt);
		limits.report(reporter);
		String reason = request.reason().strip();
		if (!explore.report(deckId, reporter, reason)) {
			throw ApiException.notFound("Deck");
		}
		// A report nobody reads protects nobody: whoever runs the site hears about it straight away.
		if (!moderationEmail.isBlank()) {
			mail.send(moderationEmail, "A deck was reported", "A player reported this deck:\n" + publicUrl + "/explore/" + deckId
					+ "\n\nTheir reason:\n" + reason + "\n\nTake it off Explore or dismiss the report on " + publicUrl + "/admin (signed in with an account listed in EREGION_ADMIN_EMAILS).");
		}
	}

	/**
	 * The analysis of a public deck's published version (bracket and its reasons, combos, consistency, speed), for
	 * anyone, signed in or not: a shared link should show what the deck is, not ask the visitor to make an account.
	 */
	@GetMapping("/{deckId}/analysis")
	public io.eregion.analysis.AnalysisDtos.Analysis analysis(HttpServletRequest http, @AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		limits.publicRead(http);
		var published = explore.find(CurrentUser.idOrNull(jwt), deckId).orElseThrow(() -> ApiException.notFound("Deck"));
		List<io.eregion.analysis.AnalysisDtos.CardInput> cards = decks.versionLines(published.versionId(), null).stream()
				.map(line -> new io.eregion.analysis.AnalysisDtos.CardInput(line.cardId(), line.board(), line.quantity()))
				.toList();
		return analysis.analyze(cards);
	}

	/** One step of a public deck's history: the version, and what changed from the step before it. */
	public record PublicHistoryStep(int versionNumber, String note, java.time.Instant createdAt, int cardCount, int added, int removed, int changed) {
	}

	/**
	 * How a public deck got to its published version, oldest first, with what each step changed. Empty when the owner
	 * hides the history. Only the published version and its ancestors are ever listed.
	 */
	@GetMapping("/{deckId}/history")
	public List<PublicHistoryStep> history(HttpServletRequest http, @AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		limits.publicRead(http);
		explore.find(CurrentUser.idOrNull(jwt), deckId).orElseThrow(() -> ApiException.notFound("Deck"));
		List<ExploreRepository.HistoryStep> steps = explore.history(deckId);
		List<PublicHistoryStep> out = new java.util.ArrayList<>();
		List<DeckCardLine> before = List.of();
		for (ExploreRepository.HistoryStep step : steps) {
			List<DeckCardLine> lines = decks.versionLines(step.versionId(), null);
			var diff = io.eregion.deck.DeckDiffer.diff(0, before, step.versionNumber(), lines);
			boolean first = out.isEmpty();
			out.add(new PublicHistoryStep(step.versionNumber(), step.note(), step.createdAt(), step.cardCount(),
					first ? 0 : diff.added().size(), first ? 0 : diff.removed().size(), first ? 0 : diff.changed().size()));
			before = lines;
		}
		return out;
	}

	/** What changed between two versions in a public deck's history. Both must be on the way to the published one. */
	@GetMapping("/{deckId}/diff")
	public io.eregion.deck.DeckDtos.DeckDiff diff(HttpServletRequest http, @AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
			@RequestParam int from, @RequestParam int to) {
		limits.publicRead(http);
		explore.find(CurrentUser.idOrNull(jwt), deckId).orElseThrow(() -> ApiException.notFound("Deck"));
		java.util.Map<Integer, UUID> shown = new java.util.HashMap<>();
		explore.history(deckId).forEach(step -> shown.put(step.versionNumber(), step.versionId()));
		if (!shown.containsKey(from) || !shown.containsKey(to)) {
			throw ApiException.notFound("Version");
		}
		return io.eregion.deck.DeckDiffer.diff(from, decks.versionLines(shown.get(from), null), to, decks.versionLines(shown.get(to), null));
	}

	/** A private or missing deck looks the same: not found. */
	@GetMapping("/{deckId}")
	public PublicDeckDetail get(HttpServletRequest http, @AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		limits.publicRead(http);
		UUID viewer = CurrentUser.idOrNull(jwt);
		var published = explore.find(viewer, deckId).orElseThrow(() -> ApiException.notFound("Deck"));
		// "owned" is counted against the viewer's own collection, so they can see what they are missing.
		List<DeckCardLine> cards = decks.versionLines(published.versionId(), viewer);
		return new PublicDeckDetail(published.deck(), cards, StatsCalculator.compute(cards));
	}
}
