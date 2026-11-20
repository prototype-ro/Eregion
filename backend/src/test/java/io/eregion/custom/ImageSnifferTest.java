package io.eregion.custom;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class ImageSnifferTest {

	private static byte[] bytes(int... values) {
		byte[] out = new byte[values.length];
		for (int i = 0; i < values.length; i++) {
			out[i] = (byte) values[i];
		}
		return out;
	}

	@Test
	void recognisesPng() {
		assertThat(ImageSniffer.contentType(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0))).contains("image/png");
	}

	@Test
	void recognisesJpeg() {
		assertThat(ImageSniffer.contentType(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0))).contains("image/jpeg");
	}

	@Test
	void recognisesWebp() {
		assertThat(ImageSniffer.contentType("RIFF....WEBPVP8 ".getBytes(StandardCharsets.ISO_8859_1))).contains("image/webp");
	}

	@Test
	void riffThatIsNotWebpIsRejected() {
		assertThat(ImageSniffer.contentType("RIFF....WAVEfmt ".getBytes(StandardCharsets.ISO_8859_1))).isEqualTo(Optional.empty());
	}

	@Test
	void svgAndHtmlAreRejectedEvenWithAnImageName() {
		assertThat(ImageSniffer.contentType("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8))).isEmpty();
		assertThat(ImageSniffer.contentType("<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8))).isEmpty();
	}

	@Test
	void tooShortOrEmptyInputIsRejected() {
		assertThat(ImageSniffer.contentType(new byte[0])).isEmpty();
		assertThat(ImageSniffer.contentType(bytes(0x89, 'P'))).isEmpty();
	}

	@Test
	void labelsAreTrimmedCollapsedAndCapped() {
		assertThat(CustomPrintingController.cleanLabel("  Foil   proxy ")).isEqualTo("Foil proxy");
		assertThat(CustomPrintingController.cleanLabel("   ")).isEqualTo("Custom");
		assertThat(CustomPrintingController.cleanLabel(null)).isEqualTo("Custom");
		assertThat(CustomPrintingController.cleanLabel("x".repeat(100))).hasSize(60);
	}

	private static byte[] encode(String format, int width, int height) throws java.io.IOException {
		var image = new java.awt.image.BufferedImage(width, height, java.awt.image.BufferedImage.TYPE_INT_RGB);
		var out = new java.io.ByteArrayOutputStream();
		javax.imageio.ImageIO.write(image, format, out);
		return out.toByteArray();
	}

	@Test
	void readsTheSizeOfRealPngAndJpegFiles() throws java.io.IOException {
		assertThat(ImageSniffer.dimensions(encode("png", 745, 1040), "image/png")).hasValueSatisfying(size -> assertThat(size).containsExactly(745, 1040));
		assertThat(ImageSniffer.dimensions(encode("jpg", 488, 680), "image/jpeg")).hasValueSatisfying(size -> assertThat(size).containsExactly(488, 680));
	}

	@Test
	void readsTheSizeAPngHeaderClaimsWithoutDecoding() {
		// 70 bytes that say 60000 x 60000: the upload must be refused on that alone.
		byte[] bomb = bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 'I', 'H', 'D', 'R', 0, 0, 0xEA, 0x60, 0, 0, 0xEA, 0x60);
		assertThat(ImageSniffer.dimensions(bomb, "image/png")).hasValueSatisfying(size -> assertThat(size).containsExactly(60000, 60000));
	}

	@Test
	void readsAnExtendedWebpHeader() {
		byte[] webp = new byte[30];
		System.arraycopy("RIFF\0\0\0\0WEBPVP8X".getBytes(StandardCharsets.ISO_8859_1), 0, webp, 0, 16);
		webp[24] = (byte) 0xE7; webp[25] = 0x02; // width - 1 = 743
		webp[27] = 0x0F; webp[28] = 0x04; // height - 1 = 1039
		assertThat(ImageSniffer.dimensions(webp, "image/webp")).hasValueSatisfying(size -> assertThat(size).containsExactly(744, 1040));
	}

	@Test
	void anUnreadableHeaderHasNoSize() {
		assertThat(ImageSniffer.dimensions(bytes(0xFF, 0xD8, 0xFF, 0x00), "image/jpeg")).isEmpty();
		assertThat(ImageSniffer.dimensions(bytes(0x89, 'P', 'N', 'G'), "image/png")).isEmpty();
	}
}
