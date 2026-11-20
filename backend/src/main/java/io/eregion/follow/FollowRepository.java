package io.eregion.follow;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class FollowRepository {

	public record Followed(UUID deckId, String name, String ownerName, Integer publishedVersion) {
	}

	/** A followed deck whose published version moved on since the follower was last told. */
	public record Change(UUID deckId, String name, String ownerName, Integer from, int to) {
	}

	public record Recipient(UUID userId, String email, UUID token) {
	}

	private final JdbcClient jdbc;

	public FollowRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Follows a public deck from its current published version; false when it is not public. */
	public boolean follow(UUID userId, UUID deckId) {
		return jdbc.sql("""
				INSERT INTO deck_follows (user_id, deck_id, last_notified_version)
				SELECT :u, d.id, v.version_number FROM decks d JOIN deck_versions v ON v.id = d.published_version_id
				 WHERE d.id = :d AND d.visibility = 'public' AND d.deleted_at IS NULL AND d.owner_id <> :u
				ON CONFLICT (user_id, deck_id) DO NOTHING
				""").param("u", userId).param("d", deckId).update() == 1 || isFollowing(userId, deckId);
	}

	public void unfollow(UUID userId, UUID deckId) {
		jdbc.sql("DELETE FROM deck_follows WHERE user_id = :u AND deck_id = :d").param("u", userId).param("d", deckId).update();
	}

	public boolean isFollowing(UUID userId, UUID deckId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM deck_follows WHERE user_id = :u AND deck_id = :d)").param("u", userId).param("d", deckId)
				.query(Boolean.class).single();
	}

	public List<Followed> following(UUID userId) {
		return jdbc.sql("""
				SELECT d.id, d.name, o.display_name, v.version_number
				  FROM deck_follows f JOIN decks d ON d.id = f.deck_id JOIN users o ON o.id = d.owner_id
				  LEFT JOIN deck_versions v ON v.id = d.published_version_id
				 WHERE f.user_id = :u ORDER BY f.created_at DESC
				""").param("u", userId)
				.query((rs, n) -> new Followed(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("display_name"),
						(Integer) rs.getObject("version_number")))
				.list();
	}

	public boolean digestEnabled(UUID userId) {
		return jdbc.sql("SELECT digest_enabled FROM users WHERE id = :u").param("u", userId).query(Boolean.class).optional().orElse(false);
	}

	public void setDigest(UUID userId, boolean enabled) {
		jdbc.sql("UPDATE users SET digest_enabled = :e WHERE id = :u").param("u", userId).param("e", enabled).update();
	}

	/** The one-click unsubscribe from an email: true when the token belonged to someone. */
	public boolean unsubscribe(UUID token) {
		return jdbc.sql("UPDATE users SET digest_enabled = false WHERE digest_token = :t").param("t", token).update() == 1;
	}

	/** Followers with the email on and a confirmed address, who follow at least one deck that moved on. */
	public List<Recipient> recipients() {
		return jdbc.sql("""
				SELECT DISTINCT u.id, u.email, u.digest_token
				  FROM users u JOIN deck_follows f ON f.user_id = u.id
				  JOIN decks d ON d.id = f.deck_id AND d.visibility = 'public' AND d.deleted_at IS NULL
				  JOIN deck_versions v ON v.id = d.published_version_id
				 WHERE u.digest_enabled AND u.email_verified AND u.disabled_at IS NULL
				   AND v.version_number IS DISTINCT FROM f.last_notified_version
				""").query((rs, n) -> new Recipient(rs.getObject("id", UUID.class), rs.getString("email"), rs.getObject("digest_token", UUID.class)))
				.list();
	}

	public List<Change> changes(UUID userId) {
		return jdbc.sql("""
				SELECT d.id, d.name, o.display_name, f.last_notified_version, v.version_number
				  FROM deck_follows f JOIN decks d ON d.id = f.deck_id AND d.visibility = 'public' AND d.deleted_at IS NULL
				  JOIN users o ON o.id = d.owner_id
				  JOIN deck_versions v ON v.id = d.published_version_id
				 WHERE f.user_id = :u AND v.version_number IS DISTINCT FROM f.last_notified_version
				 ORDER BY d.name
				""").param("u", userId)
				.query((rs, n) -> new Change(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("display_name"),
						(Integer) rs.getObject("last_notified_version"), rs.getInt("version_number")))
				.list();
	}

	public void markNotified(UUID userId, UUID deckId, int version) {
		jdbc.sql("UPDATE deck_follows SET last_notified_version = :v WHERE user_id = :u AND deck_id = :d")
				.param("u", userId).param("d", deckId).param("v", version).update();
	}

	public Optional<Boolean> verified(UUID userId) {
		return jdbc.sql("SELECT email_verified FROM users WHERE id = :u").param("u", userId).query(Boolean.class).optional();
	}
}
