package io.eregion.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import io.eregion.ratelimit.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.AuthDtos.AuthResponse;
import io.eregion.auth.AuthDtos.LoginRequest;
import io.eregion.auth.AuthDtos.RegisterRequest;
import io.eregion.auth.AuthDtos.UserDto;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
public class AuthController {

	private final AuthService auth;
	private final SessionCookie cookie;
	private final RateLimits limits;
	private final AccountService accounts;

	public AuthController(AuthService auth, SessionCookie cookie, RateLimits limits, AccountService accounts) {
		this.auth = auth;
		this.cookie = cookie;
		this.limits = limits;
		this.accounts = accounts;
	}

	/** Creates the account and signs in. The token goes out in an httpOnly cookie, never in the body. */
	@PostMapping("/auth/register")
	@ResponseStatus(HttpStatus.CREATED)
	public UserDto register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http, HttpServletResponse response) {
		limits.register(http);
		AuthResponse session = auth.register(request);
		cookie.write(response, session.token());
		return session.user();
	}

	@PostMapping("/auth/login")
	public UserDto login(@Valid @RequestBody LoginRequest request, HttpServletRequest http, HttpServletResponse response) {
		limits.loginAttempt(http, request.email());
		AuthResponse session = auth.login(request);
		limits.loginSucceeded(request.email());
		cookie.write(response, session.token());
		return session.user();
	}

	/** Always answers the same, so it cannot be used to find out which addresses have accounts. */
	@PostMapping("/auth/forgot")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public void forgot(@Valid @RequestBody AuthDtos.ForgotRequest request, HttpServletRequest http) {
		limits.mail(http, request.email());
		accounts.forgotPassword(request.email());
	}

	@PostMapping("/auth/reset")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void reset(@Valid @RequestBody AuthDtos.ResetRequest request) {
		accounts.resetPassword(request.token(), request.password());
	}

	@PostMapping("/auth/verify")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void verify(@Valid @RequestBody AuthDtos.TokenRequest request) {
		accounts.verifyEmail(request.token());
	}

	@PostMapping("/auth/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void logout(HttpServletResponse response) {
		cookie.clear(response);
	}

	@GetMapping("/me")
	public UserDto me(@AuthenticationPrincipal Jwt jwt) {
		return auth.me(CurrentUser.id(jwt));
	}
}
