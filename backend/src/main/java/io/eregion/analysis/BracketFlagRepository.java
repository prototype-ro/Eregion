package io.eregion.analysis;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class BracketFlagRepository {

	private static final int CHUNK = 500;

	private final JdbcClient jdbc;

	public BracketFlagRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Flags by normalized name, for the names that have any. */
	public Map<String, Set<String>> flagsFor(Collection<String> normalizedNames) {
		Map<String, Set<String>> found = new HashMap<>();
		List<String> names = new ArrayList<>(normalizedNames);
		for (int start = 0; start < names.size(); start += CHUNK) {
			jdbc.sql("SELECT name_norm, flag FROM bracket_flag_names WHERE name_norm IN (:names)")
					.param("names", names.subList(start, Math.min(start + CHUNK, names.size())))
					.query((rs, n) -> {
						found.computeIfAbsent(rs.getString("name_norm"), key -> new HashSet<>()).add(rs.getString("flag"));
						return null;
					})
					.list();
		}
		return found;
	}

	/** Makes the cards carrying {@code flag} from {@code source} exactly these names. */
	public void replace(String flag, String source, Collection<String> normalizedNames, Instant at) {
		jdbc.sql("DELETE FROM bracket_flag_names WHERE flag = :flag AND source = :source").param("flag", flag).param("source", source).update();
		for (String name : new HashSet<>(normalizedNames)) {
			jdbc.sql("INSERT INTO bracket_flag_names (name_norm, flag, source, synced_at) VALUES (:name, :flag, :source, :at) ON CONFLICT DO NOTHING")
					.param("name", name).param("flag", flag).param("source", source).param("at", java.sql.Timestamp.from(at)).update();
		}
	}

	public Optional<Instant> lastSynced(String source) {
		return jdbc.sql("SELECT max(synced_at) FROM bracket_flag_names WHERE source = :source")
				.param("source", source)
				.query((rs, n) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant())
				.optional()
				.filter(java.util.Objects::nonNull);
	}
}
