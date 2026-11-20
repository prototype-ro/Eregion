package io.eregion.admin;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.eregion.auth.UserRepository;
import io.eregion.common.ApiException;

/** Who may moderate: the accounts whose email is listed in EREGION_ADMIN_EMAILS. Nobody, when it is blank. */
@Component
public class AdminAccess {

	private final UserRepository users;
	private final Set<String> emails;

	public AdminAccess(UserRepository users, @Value("${eregion.admin.emails:}") String emails) {
		this.users = users;
		this.emails = Arrays.stream(emails.split(",")).map(e -> e.trim().toLowerCase(Locale.ROOT)).filter(e -> !e.isEmpty())
				.collect(Collectors.toUnmodifiableSet());
	}

	public boolean isAdmin(UUID userId) {
		return !emails.isEmpty() && users.findById(userId).map(user -> emails.contains(user.email().toLowerCase(Locale.ROOT))).orElse(false);
	}

	/** Anyone else gets a plain not-found, so the admin routes do not announce themselves. */
	public void require(UUID userId) {
		if (!isAdmin(userId)) {
			throw ApiException.notFound("Page");
		}
	}
}
