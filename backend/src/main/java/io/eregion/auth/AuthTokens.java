package io.eregion.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Makes and hashes the secrets inside emailed links. */
final class AuthTokens {

	private static final SecureRandom RANDOM = new SecureRandom();

	private AuthTokens() {
	}

	/** 32 random bytes, safe to put in a URL. The person gets this, the database gets only its hash. */
	static String newSecret() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	static String hash(String secret) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}
}
