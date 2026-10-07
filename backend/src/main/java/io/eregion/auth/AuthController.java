package io.eregion.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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

	public AuthController(AuthService auth) {
		this.auth = auth;
	}

	@PostMapping("/auth/register")
	@ResponseStatus(HttpStatus.CREATED)
	public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
		return auth.register(request);
	}

	@PostMapping("/auth/login")
	public AuthResponse login(@Valid @RequestBody LoginRequest request) {
		return auth.login(request);
	}

	@GetMapping("/me")
	public UserDto me(@AuthenticationPrincipal Jwt jwt) {
		return auth.me(CurrentUser.id(jwt));
	}
}
