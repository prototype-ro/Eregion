package io.eregion.auth;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.common.ApiException;

/** How a player likes the site to behave, kept on their account so it follows them to every device. */
@Repository
public class Preferences {

	/**
	 * variantsEnabled: the timeline offers variants (branches) and merging. Off for every new account.
	 * tourDone: the player finished or skipped the deck page tour, so it is no longer offered.
	 */
	public record Settings(boolean variantsEnabled, boolean tourDone) {
	}

	/** A change to some settings: the ones left null keep their value. */
	public record Update(Boolean variantsEnabled, Boolean tourDone) {
	}

	private final JdbcClient jdbc;

	public Preferences(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Settings of(UUID userId) {
		return jdbc.sql("SELECT variants_enabled, tour_done FROM users WHERE id = :u")
				.param("u", userId)
				.query((rs, n) -> new Settings(rs.getBoolean(1), rs.getBoolean(2)))
				.optional()
				.orElseThrow(() -> ApiException.notFound("User"));
	}

	public Settings update(UUID userId, Update change) {
		jdbc.sql("""
				UPDATE users SET variants_enabled = COALESCE(:v, variants_enabled), tour_done = COALESCE(:t, tour_done)
				 WHERE id = :u
				""").param("v", change.variantsEnabled()).param("t", change.tourDone()).param("u", userId).update();
		return of(userId);
	}
}
