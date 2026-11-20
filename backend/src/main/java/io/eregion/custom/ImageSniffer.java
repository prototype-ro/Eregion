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

	/**
	 * Width and height read from the image's own header, without decoding it: PNG's IHDR, a JPEG frame header, or a
	 * WebP VP8, VP8L or VP8X chunk. Empty when the header cannot be read, which is reason enough to refuse the file.
	 */
	static Optional<int[]> dimensions(byte[] data, String type) {
		try {
			return switch (type) {
				case "image/png" -> data.length >= 24 && data[12] == 'I' && data[13] == 'H' && data[14] == 'D' && data[15] == 'R'
						? Optional.of(new int[] { be32(data, 16), be32(data, 20) })
						: Optional.empty();
				case "image/jpeg" -> jpegDimensions(data);
				case "image/webp" -> webpDimensions(data);
				default -> Optional.empty();
			};
		}
		catch (ArrayIndexOutOfBoundsException ex) {
			return Optional.empty();
		}
	}

	/** Walks the JPEG segments to the first start-of-frame marker, which holds the height and width. */
	private static Optional<int[]> jpegDimensions(byte[] data) {
		int i = 2;
		while (i + 9 < data.length) {
			if ((data[i] & 0xFF) != 0xFF) {
				return Optional.empty();
			}
			int marker = data[i + 1] & 0xFF;
			if (marker == 0xFF) {
				i++;
				continue;
			}
			if (marker >= 0xD0 && marker <= 0xD9 || marker == 0x01) {
				i += 2;
				continue;
			}
			boolean frame = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
			if (frame) {
				return Optional.of(new int[] { be16(data, i + 7), be16(data, i + 5) });
			}
			i += 2 + be16(data, i + 2);
		}
		return Optional.empty();
	}

	private static Optional<int[]> webpDimensions(byte[] data) {
		if (data.length < 30) {
			return Optional.empty();
		}
		String chunk = new String(data, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
		return switch (chunk) {
			case "VP8 " -> Optional.of(new int[] { le16(data, 26) & 0x3FFF, le16(data, 28) & 0x3FFF });
			case "VP8L" -> {
				int b1 = data[21] & 0xFF, b2 = data[22] & 0xFF, b3 = data[23] & 0xFF, b4 = data[24] & 0xFF;
				yield Optional.of(new int[] { 1 + (b1 | (b2 & 0x3F) << 8), 1 + ((b2 >> 6) | b3 << 2 | (b4 & 0x0F) << 10) });
			}
			case "VP8X" -> Optional.of(new int[] { 1 + le24(data, 24), 1 + le24(data, 27) });
			default -> Optional.empty();
		};
	}

	private static int be32(byte[] d, int i) {
		return (d[i] & 0xFF) << 24 | (d[i + 1] & 0xFF) << 16 | (d[i + 2] & 0xFF) << 8 | d[i + 3] & 0xFF;
	}

	private static int be16(byte[] d, int i) {
		return (d[i] & 0xFF) << 8 | d[i + 1] & 0xFF;
	}

	private static int le16(byte[] d, int i) {
		return d[i] & 0xFF | (d[i + 1] & 0xFF) << 8;
	}

	private static int le24(byte[] d, int i) {
		return d[i] & 0xFF | (d[i + 1] & 0xFF) << 8 | (d[i + 2] & 0xFF) << 16;
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
