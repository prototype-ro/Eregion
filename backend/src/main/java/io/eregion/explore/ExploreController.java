package io.eregion.explore;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.common.ApiException;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckStats;
import io.eregion.deck.DeckRepository;
import io.eregion.deck.StatsCalculator;
import io.eregion.explore.ExploreRepository.PublicDeck;

/** Decks that people chose to publish. Each shows only the version its owner picked. */
@RestController
@RequestMapping("/api/explore")
public class ExploreController {

	public record PublicDeckDetail(PublicDeck deck, List<DeckCardLine> cards, DeckStats stats) {
	}

	private static final int MAX_PAGE = 48;

	private final ExploreRepository explore;
	private final DeckRepository decks;

	public ExploreController(ExploreRepository explore, DeckRepository decks) {
		this.explore = explore;
		this.decks = decks;
	}

	@GetMapping
	public List<PublicDeck> search(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID commander,
			@RequestParam(required = false) String q, @RequestParam(defaultValue = "24") int limit,
			@RequestParam(defaultValue = "0") int offset) {
		String text = q == null || q.isBlank() ? null : q.trim().substring(0, Math.min(q.trim().length(), 80));
		return explore.search(CurrentUser.id(jwt), commander, text, Math.max(1, Math.min(limit, MAX_PAGE)), Math.max(0, offset));
	}

	/** A private or missing deck looks the same: not found. */
	@GetMapping("/{deckId}")
	public PublicDeckDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		UUID viewer = CurrentUser.id(jwt);
		var published = explore.find(viewer, deckId).orElseThrow(() -> ApiException.notFound("Deck"));
		// "owned" is counted against the viewer's own collection, so they can see what they are missing.
		List<DeckCardLine> cards = decks.versionLines(published.versionId(), viewer);
		return new PublicDeckDetail(published.deck(), cards, StatsCalculator.compute(cards));
	}
}
