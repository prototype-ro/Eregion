package io.eregion.card;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.card.CardImportService.ImportResult;
import io.eregion.auth.CurrentUser;
import io.eregion.common.ApiException;
import io.eregion.ratelimit.RateLimits;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/cards")
public class CardController {

	public record ImportRequest(@NotEmpty @Size(max = 100) List<@NotBlank @Size(max = 200) String> names) {
	}

	public record ResolveRequest(@NotEmpty @Size(max = 250) List<@NotBlank @Size(max = 200) String> names) {
	}

	private final CardRepository cards;
	private final CardSearchService search;
	private final AdvancedSearchService advanced;
	private final CardImportService importer;
	private final CardResolveService resolver;
	private final PrintingService printings;
	private final RateLimits limits;

	public CardController(CardRepository cards, CardSearchService search, AdvancedSearchService advanced, CardImportService importer,
			CardResolveService resolver, PrintingService printings, RateLimits limits) {
		this.cards = cards;
		this.search = search;
		this.advanced = advanced;
		this.importer = importer;
		this.resolver = resolver;
		this.printings = printings;
		this.limits = limits;
	}

	/** Searches our catalog and, when it has too few matches, Scryfall too. Saved cards come back with ids. */
	@GetMapping("/search")
	public List<Card> search(@AuthenticationPrincipal Jwt jwt, @RequestParam String q, @RequestParam(defaultValue = "20") int limit,
			@RequestParam(defaultValue = "false") boolean commanders, @RequestParam(defaultValue = "false") boolean tokens) {
		limits.search(CurrentUser.id(jwt));
		if (q.trim().length() < 2) {
			throw ApiException.badRequest("Search needs at least 2 characters");
		}
		return search.search(q, Math.max(1, Math.min(limit, 50)), commanders, tokens);
	}

	/**
	 * Advanced search: any Scryfall filter the form builds (type, colours, mana value, text and so on), with options that are Eregion's
	 * own (legal in Commander, a role) and the order. Covers all of Scryfall, and saves what it returns.
	 */
	@GetMapping("/advanced")
	public AdvancedSearchService.Result advanced(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "") String q,
			@RequestParam(defaultValue = "true") boolean legal, @RequestParam(required = false) String role,
			@RequestParam(defaultValue = "name") String order, @RequestParam(defaultValue = "asc") String dir,
			@RequestParam(defaultValue = "1") int page) {
		limits.advancedSearch(CurrentUser.id(jwt));
		return advanced.search(q, legal, role, order, dir, page);
	}

	/** The roles the advanced search can filter by. */
	@GetMapping("/roles")
	public List<String> roles() {
		return advanced.roles();
	}

	@GetMapping("/{id}")
	public Card get(@PathVariable UUID id) {
		return cards.findById(id).orElseThrow(() -> ApiException.notFound("Card"));
	}

	/** Every printing of a card, for the printing picker. Fetched from Scryfall the first time. */
	@GetMapping("/{id}/printings")
	public List<Printing> printings(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		limits.search(CurrentUser.id(jwt));
		return printings.forCard(id);
	}

	/** Turns pasted card names into catalog cards, importing the ones we do not have yet. */
	@PostMapping("/resolve")
	public CardResolveService.Result resolve(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ResolveRequest request) {
		limits.resolve(CurrentUser.id(jwt));
		return resolver.resolve(request.names());
	}

	/** Authenticated. Pulls cards by exact name from Scryfall into our catalog. */
	@PostMapping("/import")
	public ImportResult importCards(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ImportRequest request) {
		limits.resolve(CurrentUser.id(jwt));
		return importer.importNames(request.names());
	}
}
