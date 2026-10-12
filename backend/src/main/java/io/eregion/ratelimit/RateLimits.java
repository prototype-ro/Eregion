package io.eregion.ratelimit;

import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import io.eregion.common.TooManyRequestsException;
import jakarta.servlet.http.HttpServletRequest;

/** The limits of the app in one place. Each check throws a 429 with a retry time when the limit is used up. */
@Service
public class RateLimits {

	private static final Duration MINUTE = Duration.ofMinutes(1);
	private static final Duration QUARTER_HOUR = Duration.ofMinutes(15);
	private static final Duration HOUR = Duration.ofHours(1);

	private final RateLimitProperties properties;
	private final RateLimiter limiter;

	@Autowired
	public RateLimits(RateLimitProperties properties) {
		this(properties, new RateLimiter());
	}

	RateLimits(RateLimitProperties properties, RateLimiter limiter) {
		this.properties = properties;
		this.limiter = limiter;
	}

	public void loginAttempt(HttpServletRequest request, String email) {
		check("login-ip:" + ip(request), properties.loginPerIp15Min(), QUARTER_HOUR, "sign in attempts");
		check("login-account:" + normal(email), properties.loginPerAccount15Min(), QUARTER_HOUR, "sign in attempts for this account");
	}

	/** A correct password clears the count for that account, so earlier typos stop counting against it. */
	public void loginSucceeded(String email) {
		limiter.reset("login-account:" + normal(email));
	}

	public void register(HttpServletRequest request) {
		check("register-ip:" + ip(request), properties.registerPerIpHour(), HOUR, "sign ups from this network");
	}

	/** For emails the app sends: password resets and verification links. */
	public void mail(HttpServletRequest request, String address) {
		check("mail-ip:" + ip(request), properties.mailPerIpHour(), HOUR, "email requests");
		check("mail-address:" + normal(address), properties.mailPerAddressHour(), HOUR, "emails to this address");
	}

	public void search(UUID user) {
		check("search:" + user, properties.searchPerUserMinute(), MINUTE, "searches");
	}

	/** The structured search goes to Scryfall on every new question, so it is held to fewer a minute than a name search. */
	public void advancedSearch(UUID user) {
		check("advanced-search:" + user, properties.advancedSearchPerUserMinute(), MINUTE, "advanced searches");
	}

	public void resolve(UUID user) {
		check("resolve:" + user, properties.resolvePerUserMinute(), MINUTE, "list lookups");
	}

	public void upload(UUID user) {
		check("upload:" + user, properties.uploadPerUserMinute(), MINUTE, "uploads");
	}

	/** Anyone may read public decks, so a visitor is counted by network, to keep one scraper from using it all. */
	public void publicRead(HttpServletRequest request) {
		check("public:" + ip(request), properties.publicReadPerIpMinute(), MINUTE, "page loads");
	}

	/** Saving a version, merging or copying a deck: each one writes a whole card list. */
	public void save(UUID user) {
		check("save:" + user, properties.savePerUserMinute(), MINUTE, "saves");
	}

	public void report(UUID user) {
		check("report:" + user, properties.reportPerUserHour(), HOUR, "reports");
	}

	public void urlImport(UUID user) {
		check("url-import:" + user, properties.urlImportPerUserHour(), HOUR, "imports from a link");
	}

	private void check(String key, int limit, Duration window, String what) {
		if (!properties.enabled()) {
			return;
		}
		RateLimiter.Decision decision = limiter.tryAcquire(key, limit, window);
		if (!decision.allowed()) {
			long seconds = Math.max(1, (decision.retryAfter().toMillis() + 999) / 1000);
			throw new TooManyRequestsException("Too many " + what + ". Try again in " + describe(seconds) + ".", seconds);
		}
	}

	String ip(HttpServletRequest request) {
		return ClientIp.of(request, properties.trustProxy());
	}

	private static String normal(String value) {
		return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
	}

	static String describe(long seconds) {
		if (seconds < 90) {
			return seconds + (seconds == 1 ? " second" : " seconds");
		}
		long minutes = (seconds + 59) / 60;
		return minutes < 90 ? minutes + " minutes" : ((minutes + 59) / 60) + " hours";
	}
}
