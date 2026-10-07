package io.eregion.ratelimit;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Counts how often something happens in a sliding window and says when a limit is used up. It keeps
 * its state in memory, which suits one server. With several servers each would count on its own,
 * so the effective limit grows with their number.
 */
public final class RateLimiter {

	/** allowed is false when the limit is used up, and retryAfter says how long until a slot frees. */
	public record Decision(boolean allowed, Duration retryAfter) {
	}

	private static final int CLEAN_EVERY = 2_000;
	private static final int MAX_KEYS = 200_000;

	private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();
	private final LongSupplier clock;
	private int calls;

	public RateLimiter() {
		this(System::currentTimeMillis);
	}

	/** The clock is given in milliseconds, so tests can move time without sleeping. */
	public RateLimiter(LongSupplier clock) {
		this.clock = clock;
	}

	/** Records an attempt under key if fewer than limit happened in the last window. */
	public Decision tryAcquire(String key, int limit, Duration window) {
		long now = clock.getAsLong();
		long windowMs = window.toMillis();
		Deque<Long> times = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
		Decision decision;
		synchronized (times) {
			while (!times.isEmpty() && now - times.peekFirst() >= windowMs) {
				times.pollFirst();
			}
			if (times.size() >= limit) {
				decision = new Decision(false, Duration.ofMillis(Math.max(1, windowMs - (now - times.peekFirst()))));
			}
			else {
				times.addLast(now);
				decision = new Decision(true, Duration.ZERO);
			}
		}
		if (++calls % CLEAN_EVERY == 0 || hits.size() > MAX_KEYS) {
			clean(now, windowMs);
		}
		return decision;
	}

	/** Forgets a key, for example after a successful login so earlier mistakes stop counting. */
	public void reset(String key) {
		hits.remove(key);
	}

	/** Drops keys whose newest attempt is older than the window, so the map cannot grow for ever. */
	private void clean(long now, long windowMs) {
		hits.entrySet().removeIf(entry -> {
			Deque<Long> times = entry.getValue();
			synchronized (times) {
				return times.isEmpty() || now - times.peekLast() >= Math.max(windowMs, 60 * 60 * 1000L);
			}
		});
	}

	int size() {
		return hits.size();
	}
}
