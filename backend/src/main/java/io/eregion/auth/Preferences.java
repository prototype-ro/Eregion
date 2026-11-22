package io.eregion.auth;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.common.ApiException;

/** How a player likes the site to behave, kept on their account so it follows them to every device. */
@Repository
public class Preferences {

	/** variantsEnabled: the timeline offers variants (branches) and merging. Off for every new account. */
	public record Settings(boolean variantsEnabled) {
	}

	private final JdbcClient jdbc;

	public Preferences(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Settings of(UUID userId) {
		return jdbc.sql("SELECT variants_enabled FROM users WHERE id = :u")
				.param("u", userId)
				.query((rs, n) -> new Settings(rs.getBoolean(1)))
				.optional()
				.orElseThrow(() -> ApiException.notFound("User"));
	}

	public Settings setVariants(UUID userId, boolean enabled) {
		jdbc.sql("UPDATE users SET variants_enabled = :e WHERE id = :u").param("e", enabled).param("u", userId).update();
		return of(userId);
	}
}
