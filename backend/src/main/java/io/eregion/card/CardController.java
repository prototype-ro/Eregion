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

	private final CardRepository cards;
	private final CardSearchService search;
	private final CardImportService importer;

	public CardController(CardRepository cards, CardSearchService search, CardImportService importer) {
		this.cards = cards;
		this.search = search;
		this.importer = importer;
	}

	/** Searches our catalog and, when it has too few matches, Scryfall too. Saved cards come back with ids. */
	@GetMapping("/search")
	public List<Card> search(@RequestParam String q, @RequestParam(defaultValue = "20") int limit) {
		if (q.trim().length() < 2) {
			throw ApiException.badRequest("Search needs at least 2 characters");
		}
		return search.search(q, Math.max(1, Math.min(limit, 50)));
	}

	@GetMapping("/{id}")
	public Card get(@PathVariable UUID id) {
		return cards.findById(id).orElseThrow(() -> ApiException.notFound("Card"));
	}

	/** Authenticated. Pulls cards by exact name from Scryfall into our catalog. */
	@PostMapping("/import")
	public ImportResult importCards(@Valid @RequestBody ImportRequest request) {
		return importer.importNames(request.names());
	}
}
