package io.eregion.custom;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CustomPrintingRepository {

	/** Listing data only. The image bytes are fetched separately. usedIn counts deck versions that pin it. */
	public record CustomPrinting(UUID id, UUID cardId, String label, Instant createdAt, int usedIn) {
	}

	/** storedIn is "database" (data holds the bytes) or "s3" (data is null; the bytes are in the bucket). */
	public record Image(UUID id, String contentType, byte[] data, String storedIn) {
	}

	private static final String LIST = """
			SELECT cp.id, cp.card_id, cp.label, cp.created_at,
			       (SELECT COUNT(*) FROM deck_version_cards dc WHERE dc.custom_printing_id = cp.id) AS used_in
			  FROM custom_printings cp
			""";

	private final JdbcClient jdbc;

	public CustomPrintingRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** inDatabase false leaves data empty and marks the row as stored in the bucket; the caller puts the bytes there. */
	public UUID insert(UUID userId, UUID cardId, String label, String contentType, byte[] data, boolean inDatabase) {
		return jdbc.sql("""
				INSERT INTO custom_printings (user_id, card_id, label, content_type, data, size_bytes, stored_in)
				VALUES (:user, :card, :label, :type, :data, :size, :storedIn) RETURNING id
				""")
				.param("user", userId)
				.param("card", cardId)
				.param("label", label)
				.param("type", contentType)
				.param("data", inDatabase ? data : null)
				.param("size", data.length)
				.param("storedIn", inDatabase ? "database" : "s3")
				.query(UUID.class)
				.single();
	}

	public int count(UUID userId) {
		return jdbc.sql("SELECT COUNT(*) FROM custom_printings WHERE user_id = :user").param("user", userId).query(Integer.class).single();
	}

	public long totalBytes(UUID userId) {
		return jdbc.sql("SELECT COALESCE(SUM(size_bytes), 0) FROM custom_printings WHERE user_id = :user").param("user", userId).query(Long.class).single();
	}

	/** Every player's art together, for the site-wide budget. */
	public long siteBytes() {
		return jdbc.sql("SELECT COALESCE(SUM(size_bytes), 0) FROM custom_printings").query(Long.class).single();
	}

	/** All of a player's custom art, or only the art for one card. */
	public List<CustomPrinting> list(UUID userId, UUID cardId) {
		return jdbc.sql(LIST + " WHERE cp.user_id = :user AND (CAST(:card AS uuid) IS NULL OR cp.card_id = CAST(:card AS uuid)) ORDER BY cp.created_at")
				.param("user", userId)
				.param("card", cardId)
				.query(CustomPrintingRepository::map)
				.list();
	}

	public Optional<CustomPrinting> findOwned(UUID id, UUID userId) {
		return jdbc.sql(LIST + " WHERE cp.id = :id AND cp.user_id = :user")
				.param("id", id)
				.param("user", userId)
				.query(CustomPrintingRepository::map)
				.optional();
	}

	public void delete(UUID id) {
		jdbc.sql("DELETE FROM custom_printings WHERE id = :id").param("id", id).update();
	}

	/**
	 * The image, when the viewer owns it or it is part of a public deck's published version. Anything else
	 * looks like a missing image.
	 */
	public Optional<Image> imageFor(UUID id, UUID viewerId) {
		return jdbc.sql("""
				SELECT cp.id, cp.content_type, cp.data, cp.stored_in FROM custom_printings cp
				 WHERE cp.id = :id
				   AND (cp.user_id = :viewer OR EXISTS (
				        SELECT 1 FROM decks d JOIN deck_version_cards dc ON dc.version_id = d.published_version_id AND d.deleted_at IS NULL
				         WHERE d.visibility = 'public' AND dc.custom_printing_id = cp.id))
				""")
				.param("id", id)
				.param("viewer", viewerId)
				.query((rs, n) -> new Image(rs.getObject("id", UUID.class), rs.getString("content_type"), rs.getBytes("data"), rs.getString("stored_in")))
				.optional();
	}

	private static CustomPrinting map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
		return new CustomPrinting(
				rs.getObject("id", UUID.class),
				rs.getObject("card_id", UUID.class),
				rs.getString("label"),
				rs.getTimestamp("created_at").toInstant(),
				rs.getInt("used_in"));
	}
}
