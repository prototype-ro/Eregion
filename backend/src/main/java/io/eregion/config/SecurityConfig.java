package io.eregion.config;

import java.nio.charset.StandardCharsets;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

/**
 * Stateless auth: the API issues HS256 JWTs itself and validates them with the Spring Security
 * resource server. The browser holds the token in an httpOnly cookie (see SessionCookie), and
 * SameOriginFilter protects cookie requests against cross-site forgery. No server sessions.
 */
@Configuration
public class SecurityConfig {

	@Bean
	SecretKey jwtSecretKey(JwtProperties properties, @org.springframework.beans.factory.annotation.Value("${eregion.env:dev}") String environment) {
		if ("production".equalsIgnoreCase(environment) && isPlaceholder(properties.secret())) {
			throw new IllegalStateException("EREGION_JWT_SECRET is still the development default. Set a long random secret before running in production, for example the output of: openssl rand -base64 48");
		}
		byte[] bytes = properties.secret().getBytes(StandardCharsets.UTF_8);
		if (bytes.length < 32) {
			throw new IllegalStateException("eregion.jwt.secret must be at least 32 bytes");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	/** True for the secrets that ship in the repository, which anyone can read and use to forge a login. */
	static boolean isPlaceholder(String secret) {
		String lower = secret == null ? "" : secret.toLowerCase();
		return lower.startsWith("dev-only") || lower.contains("change-me") || lower.contains("changeme");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtSecretKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSecretKey));
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtSecretKey) {
		return NimbusJwtDecoder.withSecretKey(jwtSecretKey).macAlgorithm(MacAlgorithm.HS256).build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	/** Not a bean on purpose: Spring MVC already registers a CorsConfigurationSource of its own. */
	private static CorsConfigurationSource corsSource(CorsProperties properties) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(properties.allowedOrigins());
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
		config.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", config);
		return source;
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, CorsProperties corsProperties) throws Exception {
		http
				.csrf(csrf -> csrf.disable())
				.headers(headers -> headers
						.referrerPolicy(referrer -> referrer.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
						.addHeaderWriter(new org.springframework.security.web.header.writers.StaticHeadersWriter("Permissions-Policy", "camera=(), microphone=(), geolocation=()")))
				.cors(c -> c.configurationSource(corsSource(corsProperties)))
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/api/auth/**", "/api/health", "/error").permitAll()
						.anyRequest().authenticated())
				.addFilterBefore(new SameOriginFilter(corsProperties.allowedOrigins()), BearerTokenAuthenticationFilter.class)
				.oauth2ResourceServer(oauth -> oauth
						.bearerTokenResolver(new SessionTokenResolver())
						.jwt(Customizer.withDefaults()));
		return http.build();
	}
}
