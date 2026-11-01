package io.eregion.render;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;

/**
 * Serves a card's composited frame image, scoped to the deck it was rendered for. A future task
 * composites private deck art/nicknames into this image, so visibility follows the deck: the viewer
 * must own the deck, or the deck must be public, exactly like {@code CustomPrintingController}'s image
 * endpoint. Note that reaching this without a token also requires this path to be listed under
 * {@code permitAll} in {@code SecurityConfig}, since every request is authenticated by default.
 */
@RestController
@RequestMapping("/api/decks/{deckId}/cards/{cardId}/render")
public class CardRenderController {

	private final CardRenderRepository repository;
	private final CardRenderService renderService;

	public CardRenderController(CardRenderRepository repository, CardRenderService renderService) {
		this.repository = repository;
		this.renderService = renderService;
	}

	@GetMapping("/image")
	public ResponseEntity<byte[]> getImage(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId) {
		return repository.findVisibleTo(deckId, cardId, CurrentUser.idOrNull(jwt))
				.map(render -> ResponseEntity.ok()
						.contentType(MediaType.IMAGE_PNG)
						.body(render.imageData()))
				.orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
	}
}
