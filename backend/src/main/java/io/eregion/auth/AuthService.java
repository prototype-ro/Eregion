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
	private final AccountService accounts;
	/** Checked when the email is unknown, so a missing account takes as long to refuse as a wrong password does. */
	private final String decoy;

	public AuthService(UserRepository users, PasswordEncoder encoder, TokenService tokens, AccountService accounts) {
		this.users = users;
		this.encoder = encoder;
		this.tokens = tokens;
		this.accounts = accounts;
		this.decoy = encoder.encode("not-a-real-password");
	}

	public AuthResponse register(RegisterRequest request) {
		String email = request.email().trim().toLowerCase(Locale.ROOT);
		String weak = PasswordPolicy.problem(request.password(), email, request.displayName());
		if (weak != null) {
			throw ApiException.badRequest(weak);
		}
		try {
			User user = users.insert(email, encoder.encode(request.password()), request.displayName().trim());
			accounts.sendVerification(user);
			return new AuthResponse(tokens.issue(user), UserDto.from(user));
		}
		catch (DuplicateKeyException ex) {
			throw ApiException.conflict("An account with that email already exists");
		}
	}

	public AuthResponse login(LoginRequest request) {
		String email = request.email().trim().toLowerCase(Locale.ROOT);
		User found = users.findByEmail(email).orElse(null);
		boolean match = encoder.matches(request.password(), found == null ? decoy : found.passwordHash());
		if (found == null || !match) {
			throw ApiException.unauthorized("Wrong email or password");
		}
		User user = found;
		return new AuthResponse(tokens.issue(user), UserDto.from(user));
	}

	public UserDto me(UUID userId) {
		return users.findById(userId).map(UserDto::from).orElseThrow(() -> ApiException.notFound("User"));
	}
}
