package io.eregion.card;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** A fingerprint of the files that decide the roles, so work that depends only on them can be skipped when they have not changed. */
public final class ConfigHash {

	private ConfigHash() {
	}

	public static String of(String... resources) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			for (String resource : resources) {
				try (InputStream in = ConfigHash.class.getResourceAsStream(resource)) {
					if (in == null) {
						throw new IllegalStateException(resource + " is missing");
					}
					digest.update(resource.getBytes(java.nio.charset.StandardCharsets.UTF_8));
					digest.update(in.readAllBytes());
				}
			}
			return HexFormat.of().formatHex(digest.digest());
		}
		catch (IOException | NoSuchAlgorithmException ex) {
			throw new IllegalStateException("Could not fingerprint the role files", ex);
		}
	}
}
