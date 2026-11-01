package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.proxy.ProxyDtos.CurrentRequest;
import io.eregion.proxy.ProxyDtos.GenerateRequest;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Lore;
import io.eregion.proxy.ProxyDtos.LoreRequest;
import io.eregion.proxy.ProxyDtos.MjParamsRequest;
import io.eregion.proxy.ProxyDtos.Treatment;
import io.eregion.ratelimit.RateLimits;
import jakarta.validation.Valid;

/** Proxy art prompts for the cards of one of the player's decks. */
@RestController
@RequestMapping("/api/decks/{deckId}")
public class ProxyController {

	private final ProxyService service;
	private final RateLimits limits;

	public ProxyController(ProxyService service, RateLimits limits) {
		this.service = service;
		this.limits = limits;
	}

	@GetMapping("/lore")
	public Lore lore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.lore(CurrentUser.id(jwt), deckId);
	}

	@PutMapping("/lore")
	public Lore saveLore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody LoreRequest request) {
		return service.saveLore(CurrentUser.id(jwt), deckId, request.lore(), request.mjParams());
	}

	@PutMapping("/mj-params")
	public Lore saveMjParams(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody MjParamsRequest request) {
		return service.saveMjParams(CurrentUser.id(jwt), deckId, request.mjParams());
	}

	@GetMapping("/proxies")
	public List<Treatment> proxies(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.treatments(CurrentUser.id(jwt), deckId);
	}

	@PostMapping("/proxies/{cardId}/generate")
	public Treatment generate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId,
			@Valid @RequestBody GenerateRequest request) {
		UUID userId = CurrentUser.id(jwt);
		limits.proxy(userId);
		return service.generate(userId, deckId, cardId, request.mode(), request.instruction(), request.ignoreCreatureType());
	}

	@GetMapping("/proxies/{cardId}/history")
	public List<Generation> history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId) {
		return service.history(CurrentUser.id(jwt), deckId, cardId);
	}

	@PutMapping("/proxies/{cardId}/current")
	public Treatment setCurrent(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId,
			@Valid @RequestBody CurrentRequest request) {
		return service.setCurrent(CurrentUser.id(jwt), deckId, cardId, request.generationId());
	}
}
