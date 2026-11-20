package io.eregion.follow;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.common.ApiException;

/** Following public decks, the weekly email about them, and its one-click unsubscribe. */
@RestController
public class FollowController {

	public record FollowState(boolean following) {
	}

	public record Following(boolean digestEnabled, List<FollowRepository.Followed> decks) {
	}

	public record DigestRequest(boolean enabled) {
	}

	private final FollowRepository follows;

	public FollowController(FollowRepository follows) {
		this.follows = follows;
	}

	@GetMapping("/api/explore/{deckId}/follow")
	public FollowState state(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return new FollowState(follows.isFollowing(CurrentUser.id(jwt), deckId));
	}

	/** Following sends email, so it needs an address the player has confirmed. */
	@PostMapping("/api/explore/{deckId}/follow")
	public FollowState follow(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		UUID user = CurrentUser.id(jwt);
		if (!follows.verified(user).orElse(false)) {
			throw ApiException.forbidden("Confirm your email to follow decks: the updates come by email.");
		}
		if (!follows.follow(user, deckId)) {
			throw ApiException.notFound("Deck");
		}
		return new FollowState(true);
	}

	@DeleteMapping("/api/explore/{deckId}/follow")
	public FollowState unfollow(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		follows.unfollow(CurrentUser.id(jwt), deckId);
		return new FollowState(false);
	}

	@GetMapping("/api/account/following")
	public Following following(@AuthenticationPrincipal Jwt jwt) {
		UUID user = CurrentUser.id(jwt);
		return new Following(follows.digestEnabled(user), follows.following(user));
	}

	@PutMapping("/api/account/digest")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void digest(@AuthenticationPrincipal Jwt jwt, @RequestBody DigestRequest request) {
		follows.setDigest(CurrentUser.id(jwt), request.enabled());
	}

	/** The link at the bottom of every weekly email. Works signed out; the token is the player's own secret. */
	@PostMapping("/api/digest/unsubscribe")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void unsubscribe(@RequestParam UUID token) {
		if (!follows.unsubscribe(token)) {
			throw ApiException.notFound("Subscription");
		}
	}
}
