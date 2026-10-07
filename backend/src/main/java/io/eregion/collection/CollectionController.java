package io.eregion.collection;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.card.CardRepository;
import io.eregion.collection.CollectionRepository.CollectionEntry;
import io.eregion.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/collection")
public class CollectionController {

	public record SetQuantityRequest(@Min(0) @Max(999) int quantity) {
	}

	public record BulkEntry(@NotNull UUID cardId, @Min(1) @Max(999) int quantity) {
	}

	/** mode is "add" (the default) or "replace", which empties the collection first. */
	public record BulkRequest(String mode, @NotEmpty @Size(max = 2000) List<@Valid BulkEntry> entries) {
	}

	public record BulkResult(int updated) {
	}

	private final CollectionRepository collection;
	private final CardRepository cards;
	private final CollectionService service;

	public CollectionController(CollectionRepository collection, CardRepository cards, CollectionService service) {
		this.collection = collection;
		this.cards = cards;
		this.service = service;
	}

	/** Add many cards at once, or replace the whole collection. Used by list import. */
	@PostMapping("/bulk")
	public BulkResult bulk(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BulkRequest request) {
		boolean replace = "replace".equalsIgnoreCase(request.mode());
		if (request.mode() != null && !replace && !"add".equalsIgnoreCase(request.mode())) {
			throw ApiException.badRequest("mode must be add or replace");
		}
		int updated = service.bulk(CurrentUser.id(jwt),
				request.entries().stream().map(e -> new CollectionService.Entry(e.cardId(), e.quantity())).toList(), replace);
		return new BulkResult(updated);
	}

	@GetMapping
	public List<CollectionEntry> list(@AuthenticationPrincipal Jwt jwt) {
		return collection.list(CurrentUser.id(jwt));
	}

	@PutMapping("/{cardId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void setQuantity(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cardId,
			@Valid @RequestBody SetQuantityRequest request) {
		cards.findById(cardId).orElseThrow(() -> ApiException.notFound("Card"));
		collection.setQuantity(CurrentUser.id(jwt), cardId, request.quantity());
	}
}
