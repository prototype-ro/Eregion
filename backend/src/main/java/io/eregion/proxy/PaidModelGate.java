package io.eregion.proxy;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import io.eregion.auth.User;
import io.eregion.auth.UserRepository;
import io.eregion.common.ApiException;
import io.eregion.ratelimit.RateLimits;

/**
 * Every call to the language model costs money. Accounts are free and quick to make, so only an account with a
 * confirmed email may spend it, each one stays inside its per-minute limit, and nothing is spent at all until the
 * operator turns the assistant on.
 */
@Component
public class PaidModelGate {

	private final UserRepository users;
	private final RateLimits limits;
	/** Off until the operator turns it on (EREGION_ASSISTANT_ENABLED), so a fresh deployment spends nothing. */
	private final boolean enabled;

	public PaidModelGate(UserRepository users, RateLimits limits, @Value("${eregion.assistant.enabled:false}") boolean enabled) {
		this.users = users;
		this.limits = limits;
		this.enabled = enabled;
	}

	/** Before an art prompt generation or chat turn. */
	public void proxy(UUID userId) {
		requireAllowed(userId);
		limits.proxy(userId);
	}

	/** Before a lore draft, refine, check or turn. */
	public void lore(UUID userId) {
		requireAllowed(userId);
		limits.lore(userId);
	}

	private void requireAllowed(UUID userId) {
		if (!enabled) {
			throw new ApiException(HttpStatus.NOT_FOUND, "The writing assistant is not turned on for this server.");
		}
		if (!users.findById(userId).map(User::emailVerified).orElse(false)) {
			throw ApiException.forbidden("Confirm your email to use the writing assistant.");
		}
	}
}
