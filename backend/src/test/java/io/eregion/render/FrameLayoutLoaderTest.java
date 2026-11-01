package io.eregion.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Rectangle;

import org.junit.jupiter.api.Test;

/**
 * Needs no database -- reads {@code layout.json} straight off the classpath -- so unlike
 * {@code CardRenderServiceTest} this runs (and actually passes) without Docker/Postgres.
 */
class FrameLayoutLoaderTest {

	private final FrameLayoutLoader loader = new FrameLayoutLoader();

	@Test
	void load_convertsFractionalRegionsToPixelsOnTheCardCanvas() {
		FrameLayout layout = loader.load("m15", "creature");

		Rectangle artBox = layout.region("artBox");

		assertThat(artBox.x).isEqualTo(Math.round(0.0767 * FrameLayout.CARD_WIDTH));
		assertThat(artBox.y).isEqualTo(Math.round(0.1129 * FrameLayout.CARD_HEIGHT));
		assertThat(artBox.width).isEqualTo(Math.round(0.8476 * FrameLayout.CARD_WIDTH));
		assertThat(artBox.height).isEqualTo(Math.round(0.4429 * FrameLayout.CARD_HEIGHT));
	}

	@Test
	void load_creatureSlot_hasAPtBox() {
		FrameLayout layout = loader.load("m15", "creature");

		assertThat(layout.region("ptBox")).isNotNull();
	}

	@Test
	void load_instantSlot_hasNoPtBox() {
		FrameLayout layout = loader.load("m15", "instant");

		assertThatThrownBy(() -> layout.region("ptBox")).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void load_unknownFrameFamily_throws() {
		assertThatThrownBy(() -> loader.load("nonexistent-family", "creature"))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void load_unknownTemplateSlot_throws() {
		assertThatThrownBy(() -> loader.load("m15", "nonexistent-slot"))
				.isInstanceOf(IllegalStateException.class);
	}
}
