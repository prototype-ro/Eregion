package io.eregion.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "eregion.cors")
public record CorsProperties(List<String> allowedOrigins) {
}
