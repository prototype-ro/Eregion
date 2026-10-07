package io.eregion.auth;

import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

public final class CurrentUser {

	private CurrentUser() {
	}

	public static UUID id(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	/** The signed in player, or null for a visitor who is not signed in. */
	public static UUID idOrNull(Jwt jwt) {
		return jwt == null ? null : id(jwt);
	}
}
