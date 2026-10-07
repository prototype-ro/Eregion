package io.eregion.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** One use links, stored as hashes. */
@Repository
public class AuthTokenRepository {

	private final JdbcClient jdbc;

	public AuthTokenRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Stores a new link for the player and cancels any earlier link of the same kind that is still unused. */
	public void replace(UUID userId, String purpose, String hash, Instant expiresAt) {
		jdbc.sql("DELETE FROM auth_tokens WHERE user_id = :user AND purpose = :purpose AND used_at IS NULL")
				.param("user", userId).param("purpose", purpose).update();
		jdbc.sql("INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (:user, :purpose, :hash, :expires)")
				.param("user", userId).param("purpose", purpose).param("hash", hash).param("expires", java.sql.Timestamp.from(expiresAt)).update();
	}

	/** Who a link is for, without using it up. Empty when it is unknown, used or expired. */
	public Optional<UUID> peek(String purpose, String hash) {
		return jdbc.sql("SELECT user_id FROM auth_tokens WHERE token_hash = :hash AND purpose = :purpose AND used_at IS NULL AND expires_at > now()")
				.param("hash", hash).param("purpose", purpose).query(UUID.class).optional();
	}

	/** Uses a link up. Only one caller can win, and only while the link is unused and not expired. */
	public Optional<UUID> consume(String purpose, String hash) {
		return jdbc.sql("""
				UPDATE auth_tokens SET used_at = now()
				 WHERE token_hash = :hash AND purpose = :purpose AND used_at IS NULL AND expires_at > now()
				RETURNING user_id
				""")
				.param("hash", hash)
				.param("purpose", purpose)
				.query(UUID.class)
				.optional();
	}
}
