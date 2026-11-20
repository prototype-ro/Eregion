package io.eregion.auth;

import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Session tokens ended by signing out, kept until they would have expired on their own. */
@Repository
public class RevokedSessions {

	private final JdbcClient jdbc;

	public RevokedSessions(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Ends one session. Expired entries are cleared on the way, so the table never outgrows the sessions still alive. */
	public void revoke(UUID jti, Instant expiresAt) {
		jdbc.sql("DELETE FROM revoked_sessions WHERE expires_at < now()").update();
		jdbc.sql("INSERT INTO revoked_sessions (jti, expires_at) VALUES (:jti, :expires) ON CONFLICT (jti) DO NOTHING")
				.param("jti", jti)
				.param("expires", java.sql.Timestamp.from(expiresAt))
				.update();
	}

	public boolean isRevoked(UUID jti) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM revoked_sessions WHERE jti = :jti)").param("jti", jti).query(Boolean.class).single();
	}
}
