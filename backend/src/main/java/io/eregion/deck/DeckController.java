package io.eregion.deck;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
import io.eregion.deck.DeckDtos.ApplyChangesRequest;
import io.eregion.deck.DeckDtos.MergePreview;
import io.eregion.deck.DeckDtos.MergeRequest;
import io.eregion.deck.DeckDtos.NoteRequest;
import io.eregion.deck.DeckDtos.RenameBranchRequest;
import io.eregion.deck.DeckDtos.SaveVersionRequest;
import io.eregion.deck.DeckDtos.Timeline;
import io.eregion.deck.DeckDtos.VersionDetail;
import io.eregion.deck.DeckDtos.VersionSummary;
import io.eregion.deck.DeckDtos.VisibilityRequest;
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

	@PatchMapping("/{deckId}")
	public DeckDetail rename(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody DeckDtos.RenameDeckRequest request) {
		return service.rename(deckId, CurrentUser.id(jwt), request.name());
	}

	/** Pin a deck to the top of the list or archive it. Send only the flag that changes. */
	@PatchMapping("/{deckId}/flags")
	public DeckDtos.DeckFlags flags(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @RequestBody DeckDtos.DeckFlagsRequest request) {
		return service.setFlags(deckId, CurrentUser.id(jwt), request);
	}

	@PostMapping("/{deckId}/duplicate")
	@ResponseStatus(HttpStatus.CREATED)
	public DeckDetail duplicate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.duplicate(deckId, CurrentUser.id(jwt));
	}

	@DeleteMapping("/{deckId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		service.delete(deckId, CurrentUser.id(jwt));
	}

	/** Publish one version for the Explore page, or make the deck private again. */
	@PutMapping("/{deckId}/visibility")
	public DeckDetail setVisibility(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
			@Valid @RequestBody VisibilityRequest request) {
		return service.setVisibility(deckId, CurrentUser.id(jwt), request);
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

	@PatchMapping("/{deckId}/branches/{branchId}")
	public Timeline renameBranch(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID branchId,
			@Valid @RequestBody RenameBranchRequest request) {
		return service.renameBranch(deckId, CurrentUser.id(jwt), branchId, request.name());
	}

	@DeleteMapping("/{deckId}/branches/{branchId}")
	public Timeline deleteBranch(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID branchId) {
		return service.deleteBranch(deckId, CurrentUser.id(jwt), branchId);
	}

	/** What merging a branch into main would do, without doing it. */
	@GetMapping("/{deckId}/branches/{branchId}/merge")
	public MergePreview mergePreview(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID branchId) {
		return service.mergePreview(deckId, CurrentUser.id(jwt), branchId);
	}

	@GetMapping("/{deckId}/branches/status")
	public List<DeckDtos.BranchStatus> branchStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.branchStatus(deckId, CurrentUser.id(jwt));
	}

	/** Every version a card appears in, with its board, copies and printing. */
	@GetMapping("/{deckId}/cards/{cardId}/history")
	public List<DeckDtos.CardAppearance> cardHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
			@PathVariable UUID cardId) {
		return service.cardHistory(deckId, CurrentUser.id(jwt), cardId);
	}

	@PostMapping("/{deckId}/merge")
	@ResponseStatus(HttpStatus.CREATED)
	public VersionDetail merge(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody MergeRequest request) {
		return service.merge(deckId, CurrentUser.id(jwt), request);
	}

	@PatchMapping("/{deckId}/versions/{number}")
	public Timeline updateNote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable int number,
			@Valid @RequestBody NoteRequest request) {
		return service.updateNote(deckId, CurrentUser.id(jwt), number, request.note());
	}

	/** Saves the draft over this version instead of adding a new one. Refused when other versions grew from it. */
	@PutMapping("/{deckId}/versions/{number}")
	public VersionDetail applyChanges(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable int number,
			@Valid @RequestBody ApplyChangesRequest request) {
		return service.applyChanges(deckId, CurrentUser.id(jwt), number, request);
	}

	@DeleteMapping("/{deckId}/versions/{number}")
	public Timeline deleteVersion(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable int number) {
		return service.deleteVersion(deckId, CurrentUser.id(jwt), number);
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
