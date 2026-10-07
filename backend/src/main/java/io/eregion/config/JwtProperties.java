package io.eregion.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "eregion.jwt")
public record JwtProperties(String secret, int ttlMinutes) {
}
