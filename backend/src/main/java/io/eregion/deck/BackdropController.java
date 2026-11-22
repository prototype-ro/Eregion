package io.eregion.deck;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.common.ApiException;
import io.eregion.deck.BackdropRepository.Backdrop;
import io.eregion.ratelimit.RateLimits;

/** The art behind a deck's header: the commander's by default, or another card's art its owner chose. */
@RestController
public class BackdropController {

	/** backdrop is null while the deck shows its commander's art. */
	public record Choice(Backdrop backdrop) {
	}

	public record ChooseRequest(UUID scryfallId) {
	}

	private final BackdropRepository backdrops;
	private final CardArt cardArt;
	private final DeckRepository decks;
	private final RateLimits limits;

	public BackdropController(BackdropRepository backdrops, CardArt cardArt, DeckRepository decks, RateLimits limits) {
		this.backdrops = backdrops;
		this.cardArt = cardArt;
		this.decks = decks;
		this.limits = limits;
	}

	/** Cards whose name contains q, with their art. Each search counts toward the player's search pace. */
	@GetMapping("/api/card-art")
	public List<Backdrop> search(@AuthenticationPrincipal Jwt jwt, @RequestParam("q") String q) {
		limits.search(CurrentUser.id(jwt));
		return cardArt.search(q);
	}

	/** A few cards' art at random (four unless asked otherwise, at most eight), to choose from without knowing names. */
	@GetMapping("/api/card-art/random")
	public List<Backdrop> random(@AuthenticationPrincipal Jwt jwt, @RequestParam(name = "count", defaultValue = "4") int count) {
		limits.search(CurrentUser.id(jwt));
		return cardArt.random(Math.min(Math.max(count, 1), 8));
	}

	@GetMapping("/api/decks/{deckId}/backdrop")
	public Choice get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		owned(deckId, CurrentUser.id(jwt));
		return new Choice(backdrops.find(deckId).orElse(null));
	}

	@PutMapping("/api/decks/{deckId}/backdrop")
	public Choice choose(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @RequestBody ChooseRequest request) {
		UUID user = CurrentUser.id(jwt);
		owned(deckId, user);
		if (request == null || request.scryfallId() == null) {
			throw ApiException.badRequest("Choose a card's art");
		}
		Backdrop art = cardArt.byId(request.scryfallId()).orElseThrow(() -> ApiException.badRequest("That card has no art to use"));
		backdrops.save(deckId, art);
		return new Choice(art);
	}

	/** Back to the commander's art. */
	@DeleteMapping("/api/decks/{deckId}/backdrop")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void useCommander(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		owned(deckId, CurrentUser.id(jwt));
		backdrops.clear(deckId);
	}

	private void owned(UUID deckId, UUID userId) {
		decks.findOwned(deckId, userId).orElseThrow(() -> ApiException.notFound("Deck"));
	}
}
