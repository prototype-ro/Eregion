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
}
