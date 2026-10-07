package io.eregion.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SecretGuardTest {

	private final SecurityConfig config = new SecurityConfig();

	@Test
	void theSecretsInTheRepositoryAreRecognisedAsPlaceholders() {
		assertThat(SecurityConfig.isPlaceholder("dev-only-secret-change-me-dev-only-secret")).isTrue();
		assertThat(SecurityConfig.isPlaceholder("change-me-change-me-change-me-change-me")).isTrue();
		assertThat(SecurityConfig.isPlaceholder("my-ChangeMe-secret-that-is-long-enough-1")).isTrue();
		assertThat(SecurityConfig.isPlaceholder("q8Lw2Zs9uXvJp0Rk4NtB7yHcE1aGdFmV5oIiUhYb")).isFalse();
	}

	@Test
	void productionRefusesToStartWithAPlaceholderSecret() {
		var placeholder = new JwtProperties("dev-only-secret-change-me-dev-only-secret", 60);

		assertThatThrownBy(() -> config.jwtSecretKey(placeholder, "production")).isInstanceOf(IllegalStateException.class).hasMessageContaining("EREGION_JWT_SECRET");
	}

	@Test
	void developmentStillAllowsThePlaceholder() {
		assertThat(config.jwtSecretKey(new JwtProperties("dev-only-secret-change-me-dev-only-secret", 60), "dev")).isNotNull();
	}

	@Test
	void productionAcceptsARealSecret() {
		assertThat(config.jwtSecretKey(new JwtProperties("q8Lw2Zs9uXvJp0Rk4NtB7yHcE1aGdFmV5oIiUhYb", 60), "production")).isNotNull();
	}

	@Test
	void aShortSecretIsAlwaysRefused() {
		assertThatThrownBy(() -> config.jwtSecretKey(new JwtProperties("short", 60), "production")).isInstanceOf(IllegalStateException.class);
	}
}
