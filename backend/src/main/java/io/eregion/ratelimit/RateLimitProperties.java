package io.eregion.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How many times each kind of request may happen. Limits per hour or per minute are named in the
 * property. Everything can be changed with EREGION_RATE_* settings, and switched off for tests.
 */
@ConfigurationProperties(prefix = "eregion.rate")
public record RateLimitProperties(
		@DefaultValue("true") boolean enabled,
		/** Trust X-Forwarded-For, which is right only behind a proxy that sets it and that the internet cannot bypass. */
		@DefaultValue("false") boolean trustProxy,
		@DefaultValue("20") int loginPerIp15Min,
		@DefaultValue("8") int loginPerAccount15Min,
		@DefaultValue("10") int registerPerIpHour,
		@DefaultValue("10") int mailPerIpHour,
		@DefaultValue("3") int mailPerAddressHour,
		@DefaultValue("120") int searchPerUserMinute,
		@DefaultValue("20") int resolvePerUserMinute,
		@DefaultValue("40") int uploadPerUserMinute,
		@DefaultValue("30") int urlImportPerUserHour,
		@DefaultValue("240") int publicReadPerIpMinute,
		@DefaultValue("10") int reportPerUserHour,
		@DefaultValue("30") int savePerUserMinute,
		@DefaultValue("20") int advancedSearchPerUserMinute) {
}
