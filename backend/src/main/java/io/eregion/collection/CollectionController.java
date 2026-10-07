package io.eregion.collection;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

@RestController
@RequestMapping("/api/collection")
public class CollectionController {

	public record SetQuantityRequest(@Min(0) @Max(999) int quantity) {
	}

	private final CollectionRepository collection;
	private final CardRepository cards;

	public CollectionController(CollectionRepository collection, CardRepository cards) {
		this.collection = collection;
		this.cards = cards;
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
