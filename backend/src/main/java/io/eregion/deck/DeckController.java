package io.eregion.deck;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.deck.DeckDtos.CreateDeckRequest;
import io.eregion.deck.DeckDtos.DeckDetail;
import io.eregion.deck.DeckDtos.DeckDiff;
import io.eregion.deck.DeckDtos.DeckSummary;
import io.eregion.deck.DeckDtos.SaveVersionRequest;
import io.eregion.deck.DeckDtos.Timeline;
import io.eregion.deck.DeckDtos.VersionDetail;
import io.eregion.deck.DeckDtos.VersionSummary;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/decks")
public class DeckController {

	private final DeckService service;

	public DeckController(DeckService service) {
		this.service = service;
	}

	@GetMapping
	public List<DeckSummary> list(@AuthenticationPrincipal Jwt jwt) {
		return service.list(CurrentUser.id(jwt));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public DeckDetail create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateDeckRequest request) {
		return service.create(CurrentUser.id(jwt), request);
	}

	@GetMapping("/{deckId}")
	public DeckDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.get(deckId, CurrentUser.id(jwt));
	}

	@DeleteMapping("/{deckId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		service.delete(deckId, CurrentUser.id(jwt));
	}

	@PostMapping("/{deckId}/versions")
	@ResponseStatus(HttpStatus.CREATED)
	public VersionDetail saveVersion(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
			@Valid @RequestBody SaveVersionRequest request) {
		return service.saveVersion(deckId, CurrentUser.id(jwt), request);
	}

	@GetMapping("/{deckId}/versions")
	public List<VersionSummary> versions(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.versions(deckId, CurrentUser.id(jwt));
	}

	/** All branches and their versions, for the timeline view. */
	@GetMapping("/{deckId}/timeline")
	public Timeline timeline(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.timeline(deckId, CurrentUser.id(jwt));
	}

	@GetMapping("/{deckId}/versions/{number}")
	public VersionDetail version(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
			@PathVariable int number) {
		return service.version(deckId, CurrentUser.id(jwt), number);
	}

	@GetMapping("/{deckId}/diff")
	public DeckDiff diff(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @RequestParam int from,
			@RequestParam int to) {
		return service.diff(deckId, CurrentUser.id(jwt), from, to);
	}
}
