package io.eregion.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.eregion.common.ApiException;
import io.eregion.deck.DeckRepository;

/**
 * Everything about owning an account beyond signing in: proving the email address, resetting a forgotten
 * password, changing it, ending other sessions and deleting the account.
 */
@Service
public class AccountService {

	static final String VERIFY = "verify";
	static final String RESET = "reset";
	static final Duration VERIFY_TTL = Duration.ofDays(3);
	static final Duration RESET_TTL = Duration.ofHours(1);

	private static final String BAD_LINK = "That link is not valid any more. Ask for a new one.";

	private final UserRepository users;
	private final AuthTokenRepository links;
	private final PasswordEncoder encoder;
	private final Mailer mailer;
	private final DeckRepository decks;
	private final String publicUrl;

	public AccountService(UserRepository users, AuthTokenRepository links, PasswordEncoder encoder, Mailer mailer, DeckRepository decks,
			@Value("${eregion.public-url:http://localhost:3000}") String publicUrl) {
		this.users = users;
		this.links = links;
		this.encoder = encoder;
		this.mailer = mailer;
		this.decks = decks;
		this.publicUrl = publicUrl.replaceAll("/+$", "");
	}

	// ---- email address ----

	public void sendVerification(User user) {
		String secret = AuthTokens.newSecret();
		links.replace(user.id(), VERIFY, AuthTokens.hash(secret), Instant.now().plus(VERIFY_TTL));
		mailer.send(user.email(), "Confirm your email for Eregion",
				"Hi " + user.displayName() + ",\n\nConfirm that this is your email address to be able to share decks:\n\n"
						+ publicUrl + "/verify-email?token=" + secret + "\n\nThe link works for 3 days. If you did not create an account, ignore this message.\n");
	}

	@Transactional
	public void resendVerification(UUID userId) {
		User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Account"));
		if (!user.emailVerified()) {
			sendVerification(user);
		}
	}

	@Transactional
	public void verifyEmail(String secret) {
		UUID userId = links.consume(VERIFY, AuthTokens.hash(secret)).orElseThrow(() -> ApiException.badRequest(BAD_LINK));
		users.markVerified(userId);
	}

	// ---- forgotten password ----

	/** Sends a reset link when the address has an account. It never says whether it does. */
	@Transactional
	public void forgotPassword(String email) {
		users.findByEmail(email.trim().toLowerCase(Locale.ROOT)).ifPresent(user -> {
			String secret = AuthTokens.newSecret();
			links.replace(user.id(), RESET, AuthTokens.hash(secret), Instant.now().plus(RESET_TTL));
			mailer.send(user.email(), "Reset your Eregion password",
					"Hi " + user.displayName() + ",\n\nChoose a new password here:\n\n" + publicUrl + "/reset-password?token=" + secret
							+ "\n\nThe link works once, for 1 hour. If you did not ask for this, ignore this message: your password has not changed.\n");
		});
	}

	/** Sets a new password from a reset link. Every open session ends, and the address counts as verified. */
	@Transactional
	public void resetPassword(String secret, String newPassword) {
		String hash = AuthTokens.hash(secret);
		// Look before using the link up, so a password that is too weak does not cost the person their link.
		UUID owner = links.peek(RESET, hash).orElseThrow(() -> ApiException.badRequest(BAD_LINK));
		checkPolicy(newPassword, users.findById(owner).orElseThrow(() -> ApiException.badRequest(BAD_LINK)));
		UUID userId = links.consume(RESET, hash).orElseThrow(() -> ApiException.badRequest(BAD_LINK));
		users.changePassword(userId, encoder.encode(newPassword));
		users.markVerified(userId);
	}

	// ---- signed in ----

	/** Changes the password after checking the current one, and ends every other session. Returns the account as it is now. */
	@Transactional
	public User changePassword(UUID userId, String currentPassword, String newPassword) {
		User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Account"));
		requirePassword(user, currentPassword);
		checkPolicy(newPassword, user);
		users.changePassword(userId, encoder.encode(newPassword));
		return users.findById(userId).orElseThrow();
	}

	/** Signs the account out everywhere, including the session that asked. */
	public void endAllSessions(UUID userId) {
		users.endAllSessions(userId);
	}

	/** Removes the account and everything it owns: decks, versions, collection and custom art. */
	@Transactional
	public void deleteAccount(UUID userId, String password) {
		User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Account"));
		requirePassword(user, password);
		// Decks link their versions to each other, so they are taken apart one by one.
		decks.deckIds(userId).forEach(decks::delete);
		users.delete(userId);
	}

	private void requirePassword(User user, String password) {
		if (password == null || !encoder.matches(password, user.passwordHash())) {
			throw ApiException.badRequest("That is not your current password.");
		}
	}

	private static void checkPolicy(String password, User user) {
		String problem = PasswordPolicy.problem(password, user.email(), user.displayName());
		if (problem != null) {
			throw ApiException.badRequest(problem);
		}
	}
}
