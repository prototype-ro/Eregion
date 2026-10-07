package io.eregion.auth;

import java.util.Locale;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import io.eregion.auth.AuthDtos.AuthResponse;
import io.eregion.auth.AuthDtos.LoginRequest;
import io.eregion.auth.AuthDtos.RegisterRequest;
import io.eregion.auth.AuthDtos.UserDto;
import io.eregion.common.ApiException;

@Service
public class AuthService {

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final TokenService tokens;

	public AuthService(UserRepository users, PasswordEncoder encoder, TokenService tokens) {
		this.users = users;
		this.encoder = encoder;
		this.tokens = tokens;
	}

	public AuthResponse register(RegisterRequest request) {
		String email = request.email().trim().toLowerCase(Locale.ROOT);
		try {
			User user = users.insert(email, encoder.encode(request.password()), request.displayName().trim());
			return new AuthResponse(tokens.issue(user), UserDto.from(user));
		}
		catch (DuplicateKeyException ex) {
			throw ApiException.conflict("An account with that email already exists");
		}
	}

	public AuthResponse login(LoginRequest request) {
		String email = request.email().trim().toLowerCase(Locale.ROOT);
		User user = users.findByEmail(email)
				.filter(found -> encoder.matches(request.password(), found.passwordHash()))
				.orElseThrow(() -> ApiException.unauthorized("Wrong email or password"));
		return new AuthResponse(tokens.issue(user), UserDto.from(user));
	}

	public UserDto me(UUID userId) {
		return users.findById(userId).map(UserDto::from).orElseThrow(() -> ApiException.notFound("User"));
	}
}
