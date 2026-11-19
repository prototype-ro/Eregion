package io.eregion.proxy;

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
import io.eregion.proxy.LoreDtos.CheckRequest;
import io.eregion.proxy.LoreDtos.DraftRequest;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.RefineRequest;
import io.eregion.proxy.LoreDtos.TurnReply;
import io.eregion.proxy.LoreDtos.TurnRequest;
import io.eregion.proxy.LoreDtos.Verdict;
import jakarta.validation.Valid;

/** The structured lore of a deck, and the Lore Creator's draft and card-check calls. */
@RestController
@RequestMapping("/api/decks/{deckId}/lore-doc")
public class LoreController {

	private final LoreService service;
	private final PaidModelGate gate;

	public LoreController(LoreService service, PaidModelGate gate) {
		this.service = service;
		this.gate = gate;
	}

	@GetMapping
	public LoreDoc lore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.lore(CurrentUser.id(jwt), deckId);
	}

	@PutMapping
	public LoreDoc save(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @RequestBody LoreDoc doc) {
		return service.save(CurrentUser.id(jwt), deckId, doc);
	}

	/** Each draft is a paid call to the language model. */
	@PostMapping("/draft")
	public LoreDoc draft(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody DraftRequest request) {
		UUID userId = CurrentUser.id(jwt);
		gate.lore(userId);
		return service.draft(userId, deckId, request.instruction());
	}

	/** Each refine is a paid call to the language model. */
	@PostMapping("/refine")
	public LoreDoc refine(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody RefineRequest request) {
		UUID userId = CurrentUser.id(jwt);
		gate.lore(userId);
		return service.refine(userId, deckId, request.doc(), request.target(), request.instruction());
	}

	/** Each check is a paid call to the language model. */
	@PostMapping("/check")
	public Verdict check(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody CheckRequest request) {
		UUID userId = CurrentUser.id(jwt);
		gate.lore(userId);
		return service.check(userId, deckId, request.cardId());
	}

	/** Each turn is a paid call to the language model. */
	@PostMapping("/turn")
	public TurnReply turn(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody TurnRequest request) {
		UUID userId = CurrentUser.id(jwt);
		gate.lore(userId);
		return service.turn(userId, deckId, request.doc(), request.history(), request.message());
	}
}
