package io.eregion.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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

	public AuthController(AuthService auth, SessionCookie cookie) {
		this.auth = auth;
		this.cookie = cookie;
	}

	/** Creates the account and signs in. The token goes out in an httpOnly cookie, never in the body. */
	@PostMapping("/auth/register")
	@ResponseStatus(HttpStatus.CREATED)
	public UserDto register(@Valid @RequestBody RegisterRequest request, HttpServletResponse response) {
		AuthResponse session = auth.register(request);
		cookie.write(response, session.token());
		return session.user();
	}

	@PostMapping("/auth/login")
	public UserDto login(@Valid @RequestBody LoginRequest request, HttpServletResponse response) {
		AuthResponse session = auth.login(request);
		cookie.write(response, session.token());
		return session.user();
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
