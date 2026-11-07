package io.eregion.common;

import java.time.Instant;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** When each background job last ran, so a restart does not immediately repeat work that is still fresh. */
@Repository
public class AppSyncStateRepository {

	private final JdbcClient jdbc;

	public AppSyncStateRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<Instant> lastSynced(String job) {
		return jdbc.sql("SELECT synced_at FROM app_sync_state WHERE job = :job")
				.param("job", job)
				.query((rs, n) -> rs.getTimestamp(1).toInstant())
				.optional();
	}

	public void recordRun(String job) {
		jdbc.sql("""
				INSERT INTO app_sync_state (job, synced_at) VALUES (:job, now())
				ON CONFLICT (job) DO UPDATE SET synced_at = now()
				""")
				.param("job", job)
				.update();
	}
}
