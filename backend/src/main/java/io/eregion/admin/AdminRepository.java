package io.eregion.admin;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class AdminRepository {

	public record Report(UUID id, UUID deckId, String deckName, String deckVisibility, String ownerName, String ownerEmail, String reporterName,
			String reason, Instant createdAt, Instant resolvedAt, String resolution) {
	}

	public record UserSummary(UUID id, String email, String displayName, boolean emailVerified, Instant createdAt, Instant disabledAt, int decks,
			int publicDecks, long artBytes) {
	}

	private final JdbcClient jdbc;

	public AdminRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public List<Report> reports(boolean includeResolved) {
		return jdbc.sql("""
				SELECT r.id, r.deck_id, d.name AS deck_name, d.visibility, o.display_name AS owner_name, o.email AS owner_email,
				       rp.display_name AS reporter_name, r.reason, r.created_at, r.resolved_at, r.resolution
				  FROM deck_reports r
				  JOIN decks d ON d.id = r.deck_id
				  JOIN users o ON o.id = d.owner_id
				  LEFT JOIN users rp ON rp.id = r.reporter_id
				 WHERE :all OR r.resolved_at IS NULL
				 ORDER BY r.resolved_at NULLS FIRST, r.created_at DESC
				 LIMIT 200
				""").param("all", includeResolved)
				.query((rs, n) -> new Report(rs.getObject("id", UUID.class), rs.getObject("deck_id", UUID.class), rs.getString("deck_name"),
						rs.getString("visibility"), rs.getString("owner_name"), rs.getString("owner_email"), rs.getString("reporter_name"),
						rs.getString("reason"), rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("resolved_at") == null ? null : rs.getTimestamp("resolved_at").toInstant(), rs.getString("resolution")))
				.list();
	}

	public Optional<UUID> reportDeck(UUID reportId) {
		return jdbc.sql("SELECT deck_id FROM deck_reports WHERE id = :id").param("id", reportId).query(UUID.class).optional();
	}

	/** Marks every open report of the deck resolved, since one decision answers them all. */
	public void resolveReportsOf(UUID deckId, String resolution) {
		jdbc.sql("UPDATE deck_reports SET resolved_at = now(), resolution = :r WHERE deck_id = :d AND resolved_at IS NULL")
				.param("d", deckId).param("r", resolution).update();
	}

	public void resolveReport(UUID reportId, String resolution) {
		jdbc.sql("UPDATE deck_reports SET resolved_at = now(), resolution = :r WHERE id = :id").param("id", reportId).param("r", resolution).update();
	}

	public void unpublish(UUID deckId) {
		jdbc.sql("UPDATE decks SET visibility = 'private', published_version_id = NULL, published_at = NULL WHERE id = :d").param("d", deckId).update();
	}

	public Optional<UserSummary> userByEmail(String email) {
		return jdbc.sql("""
				SELECT u.id, u.email, u.display_name, u.email_verified, u.created_at, u.disabled_at,
				       (SELECT COUNT(*) FROM decks d WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS decks,
				       (SELECT COUNT(*) FROM decks d WHERE d.owner_id = u.id AND d.deleted_at IS NULL AND d.visibility = 'public') AS public_decks,
				       (SELECT COALESCE(SUM(size_bytes), 0) FROM custom_printings c WHERE c.user_id = u.id) AS art_bytes
				  FROM users u WHERE lower(u.email) = lower(:email)
				""").param("email", email)
				.query((rs, n) -> new UserSummary(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("display_name"),
						rs.getBoolean("email_verified"), rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("disabled_at") == null ? null : rs.getTimestamp("disabled_at").toInstant(), rs.getInt("decks"),
						rs.getInt("public_decks"), rs.getLong("art_bytes")))
				.optional();
	}

	/** Disables the account: no more sign-in, every session ends, and its public decks go private. */
	public void disable(UUID userId) {
		jdbc.sql("UPDATE users SET disabled_at = now(), token_version = token_version + 1 WHERE id = :id").param("id", userId).update();
		jdbc.sql("UPDATE decks SET visibility = 'private', published_version_id = NULL, published_at = NULL WHERE owner_id = :id")
				.param("id", userId).update();
	}

	public void enable(UUID userId) {
		jdbc.sql("UPDATE users SET disabled_at = NULL WHERE id = :id").param("id", userId).update();
	}

	public boolean deleteArt(UUID artId) {
		return jdbc.sql("DELETE FROM custom_printings WHERE id = :id").param("id", artId).update() == 1;
	}
}
