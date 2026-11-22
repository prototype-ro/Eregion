package io.eregion.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.AuthDtos.ChangePasswordRequest;
import io.eregion.auth.AuthDtos.DeleteAccountRequest;
import io.eregion.auth.AuthDtos.UserDto;
import io.eregion.ratelimit.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

/** Things a signed in player does to their own account. */
@RestController
@RequestMapping("/api/account")
public class AccountController {

	private final AccountService accounts;
	private final AuthService auth;
	private final TokenService tokens;
	private final SessionCookie cookie;
	private final RateLimits limits;
	private final Preferences preferences;

	public AccountController(AccountService accounts, AuthService auth, TokenService tokens, SessionCookie cookie, RateLimits limits, Preferences preferences) {
		this.accounts = accounts;
		this.auth = auth;
		this.tokens = tokens;
		this.cookie = cookie;
		this.limits = limits;
		this.preferences = preferences;
	}

	/** How the player likes the site to behave. */
	@GetMapping("/preferences")
	public Preferences.Settings preferences(@AuthenticationPrincipal Jwt jwt) {
		return preferences.of(CurrentUser.id(jwt));
	}

	/** Turns variants (branches and merging) on or off for this player, on every device. */
	@PutMapping("/preferences")
	public Preferences.Settings setPreferences(@AuthenticationPrincipal Jwt jwt, @RequestBody Preferences.Settings request) {
		return preferences.setVariants(CurrentUser.id(jwt), request.variantsEnabled());
	}

	@PostMapping("/resend-verification")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resendVerification(@AuthenticationPrincipal Jwt jwt, HttpServletRequest http) {
		UserDto me = auth.me(CurrentUser.id(jwt));
		limits.mail(http, me.email());
		accounts.resendVerification(me.id());
	}

	/** The other sessions end, and this one carries on with a fresh cookie. */
	@PostMapping("/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest request, HttpServletResponse response) {
		User user = accounts.changePassword(CurrentUser.id(jwt), request.currentPassword(), request.newPassword());
		cookie.write(response, tokens.issue(user));
	}

	@PostMapping("/sessions/end")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void endAllSessions(@AuthenticationPrincipal Jwt jwt, HttpServletResponse response) {
		accounts.endAllSessions(CurrentUser.id(jwt));
		cookie.clear(response);
	}

	@PostMapping("/delete")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DeleteAccountRequest request, HttpServletResponse response) {
		accounts.deleteAccount(CurrentUser.id(jwt), request.password());
		cookie.clear(response);
	}
}
