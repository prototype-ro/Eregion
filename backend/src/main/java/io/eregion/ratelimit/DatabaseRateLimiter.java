package io.eregion.ratelimit;

import java.time.Duration;
import java.util.function.LongSupplier;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Rate limits counted in Postgres (rate_hits), in fixed windows: the count of a key in the current window goes up by
 * one per attempt, in one statement, so every API server sees the same number and a restart forgets nothing.
 * Windows older than two hours are cleared now and then; no limit here is longer than an hour.
 */
public class DatabaseRateLimiter extends RateLimiter {

	private static final int CLEAN_EVERY = 1_000;

	private final JdbcClient jdbc;
	private final LongSupplier clock;
	private int calls;

	public DatabaseRateLimiter(JdbcClient jdbc) {
		this(jdbc, System::currentTimeMillis);
	}

	DatabaseRateLimiter(JdbcClient jdbc, LongSupplier clock) {
		super(clock);
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Override
	public Decision tryAcquire(String key, int limit, Duration window) {
		long now = clock.getAsLong();
		long windowMs = window.toMillis();
		long start = now - now % windowMs;
		int hits = jdbc.sql("""
				INSERT INTO rate_hits (key, window_start, hits) VALUES (:key, :start, 1)
				ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_hits.hits + 1
				RETURNING hits
				""").param("key", key).param("start", start).query(Integer.class).single();
		if (++calls % CLEAN_EVERY == 0) {
			jdbc.sql("DELETE FROM rate_hits WHERE window_start < :before").param("before", now - 2 * 60 * 60 * 1000L).update();
		}
		return hits <= limit ? new Decision(true, Duration.ZERO) : new Decision(false, Duration.ofMillis(Math.max(1, start + windowMs - now)));
	}

	@Override
	public void reset(String key) {
		jdbc.sql("DELETE FROM rate_hits WHERE key = :key").param("key", key).update();
	}
}
