package io.eregion.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import io.eregion.common.TooManyRequestsException;

class RateLimiterTest {

	private final AtomicLong now = new AtomicLong(1_000_000);
	private final RateLimiter limiter = new RateLimiter(now::get);

	@Test
	void allowsUpToTheLimitThenRefuses() {
		for (int i = 0; i < 3; i++) {
			assertThat(limiter.tryAcquire("k", 3, Duration.ofMinutes(1)).allowed()).isTrue();
		}
		var refused = limiter.tryAcquire("k", 3, Duration.ofMinutes(1));

		assertThat(refused.allowed()).isFalse();
		assertThat(refused.retryAfter()).isEqualTo(Duration.ofMinutes(1));
	}

	@Test
	void slotsFreeUpAsTheWindowMovesOn() {
		limiter.tryAcquire("k", 2, Duration.ofMinutes(1));
		now.addAndGet(30_000);
		limiter.tryAcquire("k", 2, Duration.ofMinutes(1));
		assertThat(limiter.tryAcquire("k", 2, Duration.ofMinutes(1)).allowed()).isFalse();

		now.addAndGet(31_000); // the first attempt is now older than a minute
		assertThat(limiter.tryAcquire("k", 2, Duration.ofMinutes(1)).allowed()).isTrue();
	}

	@Test
	void tellsHowLongUntilTheOldestAttemptExpires() {
		limiter.tryAcquire("k", 1, Duration.ofMinutes(10));
		now.addAndGet(4 * 60_000);

		assertThat(limiter.tryAcquire("k", 1, Duration.ofMinutes(10)).retryAfter()).isEqualTo(Duration.ofMinutes(6));
	}

	@Test
	void keysAreIndependent() {
		limiter.tryAcquire("a", 1, Duration.ofMinutes(1));

		assertThat(limiter.tryAcquire("a", 1, Duration.ofMinutes(1)).allowed()).isFalse();
		assertThat(limiter.tryAcquire("b", 1, Duration.ofMinutes(1)).allowed()).isTrue();
	}

	@Test
	void refusedAttemptsDoNotExtendTheBlock() {
		limiter.tryAcquire("k", 1, Duration.ofMinutes(1));
		for (int i = 0; i < 50; i++) {
			limiter.tryAcquire("k", 1, Duration.ofMinutes(1));
		}
		now.addAndGet(61_000);

		assertThat(limiter.tryAcquire("k", 1, Duration.ofMinutes(1)).allowed()).isTrue();
	}

	@Test
	void resetForgetsAKey() {
		limiter.tryAcquire("k", 1, Duration.ofMinutes(1));
		limiter.reset("k");

		assertThat(limiter.tryAcquire("k", 1, Duration.ofMinutes(1)).allowed()).isTrue();
	}

	@Test
	void oldKeysAreCleanedUpSoMemoryDoesNotGrow() {
		for (int i = 0; i < 1_999; i++) {
			limiter.tryAcquire("old" + i, 5, Duration.ofMinutes(1));
		}
		now.addAndGet(2 * 60 * 60 * 1000L);
		limiter.tryAcquire("fresh", 5, Duration.ofMinutes(1)); // the 2,000th call triggers the cleanup

		assertThat(limiter.size()).isEqualTo(1);
	}

	// ---- the limits of the app

	private RateLimits limits(int loginAccount) {
		var props = new RateLimitProperties(true, false, 20, loginAccount, 10, 10, 3, 120, 20, 40, 30, 240, 10);
		return new RateLimits(props, limiter);
	}

	private static MockHttpServletRequest request(String ip) {
		var request = new MockHttpServletRequest();
		request.setRemoteAddr(ip);
		return request;
	}

	@Test
	void tooManyWrongLoginsForOneAccountAreRefusedWithARetryTime() {
		var limits = limits(3);
		for (int i = 0; i < 3; i++) {
			limits.loginAttempt(request("1.1.1.1"), "Me@Example.com");
		}

		assertThatThrownBy(() -> limits.loginAttempt(request("2.2.2.2"), "me@example.com"))
				.isInstanceOfSatisfying(TooManyRequestsException.class, ex -> {
					assertThat(ex.retryAfterSeconds()).isEqualTo(900);
					assertThat(ex.getMessage()).contains("Try again in 15 minutes");
				});
	}

	@Test
	void aSuccessfulLoginClearsTheAccountCount() {
		var limits = limits(2);
		limits.loginAttempt(request("1.1.1.1"), "me@example.com");
		limits.loginAttempt(request("1.1.1.1"), "me@example.com");
		limits.loginSucceeded("me@example.com");

		limits.loginAttempt(request("1.1.1.1"), "me@example.com");
	}

	@Test
	void oneNetworkCannotTryManyAccounts() {
		var limits = limits(8);
		for (int i = 0; i < 20; i++) {
			limits.loginAttempt(request("9.9.9.9"), "user" + i + "@example.com");
		}

		assertThatThrownBy(() -> limits.loginAttempt(request("9.9.9.9"), "another@example.com")).isInstanceOf(TooManyRequestsException.class);
		limits.loginAttempt(request("8.8.8.8"), "another@example.com");
	}

	@Test
	void switchedOffMeansNoLimits() {
		var off = new RateLimits(new RateLimitProperties(false, false, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), limiter);
		for (int i = 0; i < 10; i++) {
			off.register(request("1.1.1.1"));
		}
	}

	@Test
	void waitsAreDescribedInPlainWords() {
		assertThat(RateLimits.describe(1)).isEqualTo("1 second");
		assertThat(RateLimits.describe(45)).isEqualTo("45 seconds");
		assertThat(RateLimits.describe(900)).isEqualTo("15 minutes");
		assertThat(RateLimits.describe(7200)).isEqualTo("2 hours");
	}

	@Test
	void theForwardedAddressIsOnlyTrustedWhenTheProxyIsTrusted() {
		var request = request("10.0.0.1");
		request.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.9");

		assertThat(ClientIp.of(request, false)).isEqualTo("10.0.0.1");
		// The last entry is the one the proxy appended. The first can be written by the caller.
		assertThat(ClientIp.of(request, true)).isEqualTo("203.0.113.9");
	}
}
