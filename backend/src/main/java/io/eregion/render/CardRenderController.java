package io.eregion.render;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves a card's composited frame image. Deliberately unauthenticated, like
 * {@code CustomPrintingController}'s image endpoint: a rendered card image isn't sensitive the way
 * deck ownership is, so there is no {@code @AuthenticationPrincipal} check here. Note that reaching
 * this without a token also requires this path to be listed under {@code permitAll} in
 * {@code SecurityConfig}, since every request is authenticated by default.
 */
@RestController
@RequestMapping("/api/cards/{cardId}/render")
public class CardRenderController {

	private final CardRenderRepository repository;
	private final CardRenderService renderService;

	public CardRenderController(CardRenderRepository repository, CardRenderService renderService) {
		this.repository = repository;
		this.renderService = renderService;
	}

	@GetMapping("/image")
	public ResponseEntity<byte[]> getImage(@PathVariable UUID cardId) {
		return repository.findByCardId(cardId)
				.map(render -> ResponseEntity.ok()
						.contentType(MediaType.IMAGE_PNG)
						.body(render.imageData()))
				.orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
	}
}
