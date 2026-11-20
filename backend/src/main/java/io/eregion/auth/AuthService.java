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

	private final io.eregion.admin.AdminAccess admins;

	public AuthService(UserRepository users, PasswordEncoder encoder, TokenService tokens, AccountService accounts, io.eregion.admin.AdminAccess admins) {
		this.admins = admins;
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
		// Checked only after the password, so a disabled address cannot be told apart from a wrong guess.
		if (users.isDisabled(found.id())) {
			throw ApiException.forbidden("This account has been disabled. If you think that is a mistake, write to the contact address in the footer.");
		}
		User user = found;
		return new AuthResponse(tokens.issue(user), UserDto.from(user));
	}

	public UserDto me(UUID userId) {
		return users.findById(userId).map(user -> UserDto.from(user, admins.isAdmin(userId))).orElseThrow(() -> ApiException.notFound("User"));
	}
}
