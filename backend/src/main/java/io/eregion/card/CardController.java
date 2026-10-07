package io.eregion.card;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.card.CardImportService.ImportResult;
import io.eregion.common.ApiException;
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
	private final CardImportService importer;
	private final CardResolveService resolver;
	private final PrintingService printings;

	public CardController(CardRepository cards, CardSearchService search, CardImportService importer,
			CardResolveService resolver, PrintingService printings) {
		this.cards = cards;
		this.search = search;
		this.importer = importer;
		this.resolver = resolver;
		this.printings = printings;
	}

	/** Searches our catalog and, when it has too few matches, Scryfall too. Saved cards come back with ids. */
	@GetMapping("/search")
	public List<Card> search(@RequestParam String q, @RequestParam(defaultValue = "20") int limit,
			@RequestParam(defaultValue = "false") boolean commanders) {
		if (q.trim().length() < 2) {
			throw ApiException.badRequest("Search needs at least 2 characters");
		}
		return search.search(q, Math.max(1, Math.min(limit, 50)), commanders);
	}

	@GetMapping("/{id}")
	public Card get(@PathVariable UUID id) {
		return cards.findById(id).orElseThrow(() -> ApiException.notFound("Card"));
	}

	/** Every printing of a card, for the printing picker. Fetched from Scryfall the first time. */
	@GetMapping("/{id}/printings")
	public List<Printing> printings(@PathVariable UUID id) {
		return printings.forCard(id);
	}

	/** Turns pasted card names into catalog cards, importing the ones we do not have yet. */
	@PostMapping("/resolve")
	public CardResolveService.Result resolve(@Valid @RequestBody ResolveRequest request) {
		return resolver.resolve(request.names());
	}

	/** Authenticated. Pulls cards by exact name from Scryfall into our catalog. */
	@PostMapping("/import")
	public ImportResult importCards(@Valid @RequestBody ImportRequest request) {
		return importer.importNames(request.names());
	}
}
