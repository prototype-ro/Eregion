package io.eregion.auth;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.common.ApiException;
import io.eregion.ratelimit.RateLimits;

/**
 * Everything Eregion keeps about a player, as one JSON file they can download: the account, every deck with every
 * version and its cards (the trash included), branches, the collection, uploaded art (labels and addresses; the images
 * download from their own address), and reports they made. The right of access and portability under the LGPD and
 * GDPR, without writing to anyone.
 */
@RestController
@RequestMapping("/api/account")
public class DataExportController {

	private final JdbcClient jdbc;
	private final RateLimits limits;

	public DataExportController(JdbcClient jdbc, RateLimits limits) {
		this.jdbc = jdbc;
		this.limits = limits;
	}

	@GetMapping("/export")
	public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal Jwt jwt) {
		UUID user = CurrentUser.id(jwt);
		// A heavy read: held to the same pace as other uploads and downloads of a player's own data.
		limits.upload(user);
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("exportedAt", java.time.Instant.now().toString());
		out.put("account", jdbc.sql("""
				SELECT email, display_name AS "displayName", email_verified AS "emailVerified", created_at::text AS "createdAt"
				  FROM users WHERE id = :u
				""").param("u", user).query().singleRow());
		if (out.get("account") == null) {
			throw ApiException.notFound("User");
		}

		List<Map<String, Object>> decks = jdbc.sql("""
				SELECT id, name, format, description, visibility, created_at::text AS "createdAt", updated_at::text AS "updatedAt",
				       deleted_at::text AS "inTrashSince", declared_bracket AS "declaredBracket", pinned, archived
				  FROM decks WHERE owner_id = :u ORDER BY created_at
				""").param("u", user).query().listOfRows();
		for (Map<String, Object> deck : decks) {
			UUID deckId = (UUID) deck.get("id");
			deck.put("branches", jdbc.sql("SELECT id, name, is_main AS \"main\", created_at::text AS \"createdAt\" FROM deck_branches WHERE deck_id = :d ORDER BY created_at")
					.param("d", deckId).query().listOfRows());
			List<Map<String, Object>> versions = jdbc.sql("""
					SELECT v.id, v.version_number AS "number", v.note, v.created_at::text AS "createdAt", b.name AS branch,
					       p.version_number AS "parentVersion", m.version_number AS "mergedFromVersion"
					  FROM deck_versions v JOIN deck_branches b ON b.id = v.branch_id
					  LEFT JOIN deck_versions p ON p.id = v.parent_version_id
					  LEFT JOIN deck_versions m ON m.id = v.merge_parent_version_id
					 WHERE v.deck_id = :d ORDER BY v.version_number
					""").param("d", deckId).query().listOfRows();
			for (Map<String, Object> version : versions) {
				version.put("cards", jdbc.sql("""
						SELECT c.name, dc.board, dc.quantity, array_to_string(dc.tags, ', ') AS tags, p.set_code AS "set", p.collector_number AS "number", dc.custom_printing_id AS "customArt"
						  FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
						  LEFT JOIN card_printings p ON p.scryfall_id = dc.printing_id
						 WHERE dc.version_id = :v ORDER BY dc.board, c.name
						""").param("v", version.get("id")).query().listOfRows());
				version.remove("id");
			}
			deck.put("versions", versions);
		}
		out.put("decks", decks);
		out.put("collection", jdbc.sql("""
				SELECT c.name, e.quantity FROM collection_entries e JOIN cards c ON c.id = e.card_id WHERE e.user_id = :u ORDER BY c.name
				""").param("u", user).query().listOfRows());
		out.put("customArt", jdbc.sql("""
				SELECT cp.id, c.name AS card, cp.label, cp.content_type AS "type", cp.size_bytes AS "bytes", cp.created_at::text AS "createdAt",
				       '/api/custom-printings/' || cp.id || '/image' AS image
				  FROM custom_printings cp JOIN cards c ON c.id = cp.card_id WHERE cp.user_id = :u ORDER BY cp.created_at
				""").param("u", user).query().listOfRows());
		out.put("reportsMade", jdbc.sql("""
				SELECT d.name AS deck, r.reason, r.created_at::text AS "createdAt" FROM deck_reports r JOIN decks d ON d.id = r.deck_id
				 WHERE r.reporter_id = :u ORDER BY r.created_at
				""").param("u", user).query().listOfRows());
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"eregion-data.json\"")
				.body(out);
	}
}
