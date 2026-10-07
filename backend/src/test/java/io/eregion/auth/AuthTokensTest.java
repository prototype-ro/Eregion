package io.eregion.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

class AuthTokensTest {

	@Test
	void secretsAreLongRandomAndSafeInAUrl() {
		Set<String> seen = new HashSet<>();
		for (int i = 0; i < 200; i++) {
			String secret = AuthTokens.newSecret();
			assertThat(secret).hasSize(43).matches("[A-Za-z0-9_-]+");
			seen.add(secret);
		}
		assertThat(seen).hasSize(200);
	}

	@Test
	void theHashIsStableAndDoesNotRevealTheSecret() {
		String hash = AuthTokens.hash("abc");

		assertThat(hash).isEqualTo(AuthTokens.hash("abc")).hasSize(64).matches("[0-9a-f]+").doesNotContain("abc");
		assertThat(AuthTokens.hash("abd")).isNotEqualTo(hash);
	}

	@Test
	void knownSha256Vector() {
		assertThat(AuthTokens.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	}
}
