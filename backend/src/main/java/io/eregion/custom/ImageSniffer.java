package io.eregion.custom;

import java.util.Optional;

/** Tells what kind of image some bytes are from their first bytes, never from the file name or what the client claims. */
final class ImageSniffer {

	private ImageSniffer() {
	}

	/** The content type for a PNG, JPEG or WebP image, or empty for anything else. */
	static Optional<String> contentType(byte[] data) {
		if (data.length >= 8 && startsWith(data, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) {
			return Optional.of("image/png");
		}
		if (data.length >= 3 && startsWith(data, 0xFF, 0xD8, 0xFF)) {
			return Optional.of("image/jpeg");
		}
		if (data.length >= 12 && startsWith(data, 'R', 'I', 'F', 'F') && data[8] == 'W' && data[9] == 'E' && data[10] == 'B'
				&& data[11] == 'P') {
			return Optional.of("image/webp");
		}
		return Optional.empty();
	}

	private static boolean startsWith(byte[] data, int... expected) {
		for (int i = 0; i < expected.length; i++) {
			if ((data[i] & 0xFF) != expected[i]) {
				return false;
			}
		}
		return true;
	}
}
