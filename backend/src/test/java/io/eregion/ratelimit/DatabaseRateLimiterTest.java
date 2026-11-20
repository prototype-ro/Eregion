package io.eregion.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import io.eregion.support.PostgresTest;

/** Limits counted in Postgres: shared by every server, kept across restarts, and cleared by reset. */
class DatabaseRateLimiterTest extends PostgresTest {

	@Test
	void countsInTheDatabaseAndSaysWhenTheWindowEnds() {
		AtomicLong now = new AtomicLong(1_000_000_000L);
		DatabaseRateLimiter first = new DatabaseRateLimiter(jdbc, now::get);
		DatabaseRateLimiter second = new DatabaseRateLimiter(jdbc, now::get);
		Duration minute = Duration.ofMinutes(1);

		assertThat(first.tryAcquire("login-ip:1.2.3.4", 2, minute).allowed()).isTrue();
		// Another server, or this one after a restart, sees the same count.
		assertThat(second.tryAcquire("login-ip:1.2.3.4", 2, minute).allowed()).isTrue();
		RateLimiter.Decision third = first.tryAcquire("login-ip:1.2.3.4", 2, minute);
		assertThat(third.allowed()).isFalse();
		assertThat(third.retryAfter()).isPositive().isLessThanOrEqualTo(minute);

		now.addAndGet(minute.toMillis());
		assertThat(first.tryAcquire("login-ip:1.2.3.4", 2, minute).allowed()).isTrue();
	}

	@Test
	void resetForgetsAKey() {
		DatabaseRateLimiter limiter = new DatabaseRateLimiter(jdbc, () -> 2_000_000_000L);
		limiter.tryAcquire("login-account:a@example.com", 1, Duration.ofMinutes(15));
		assertThat(limiter.tryAcquire("login-account:a@example.com", 1, Duration.ofMinutes(15)).allowed()).isFalse();

		limiter.reset("login-account:a@example.com");
		assertThat(limiter.tryAcquire("login-account:a@example.com", 1, Duration.ofMinutes(15)).allowed()).isTrue();
	}
}
