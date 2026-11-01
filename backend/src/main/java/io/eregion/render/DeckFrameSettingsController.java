package io.eregion.render;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;

@RestController
@RequestMapping("/api/decks/{deckId}/frame-settings")
public class DeckFrameSettingsController {

	private final DeckFrameSettingsService service;

	public DeckFrameSettingsController(DeckFrameSettingsService service) {
		this.service = service;
	}

	@GetMapping
	public DeckFrameSettingsRepository.FrameSettingsRow get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.get(deckId, CurrentUser.id(jwt));
	}

	@PutMapping
	public DeckFrameSettingsRepository.FrameSettingsRow put(
			@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
			@RequestBody DeckFrameSettingsService.FrameSettingsRequest request) {
		return service.save(deckId, CurrentUser.id(jwt), request);
	}
}
