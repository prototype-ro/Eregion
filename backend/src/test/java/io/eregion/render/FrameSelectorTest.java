package io.eregion.render;

import org.junit.jupiter.api.Test;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class FrameSelectorTest {

	private final FrameSelector selector = new FrameSelector(Set.of("m15"));

	@Test
	void monoColorCreature_selectsColorBorder() {
		FrameSelection selection = selector.select(
			"Creature — Bear", "G", "m15", "Grizzly Bears", null);

		assertThat(selection.templateSlot()).isEqualTo("creature");
		assertThat(selection.borderTreatment()).isEqualTo("mono-G");
		assertThat(selection.title()).isEqualTo("Grizzly Bears");
		assertThat(selection.subtitle()).isNull();
	}

	@Test
	void multicolorCard_selectsGoldBorder() {
		FrameSelection selection = selector.select(
			"Creature — Angel", "WU", "m15", "Alela", null);

		assertThat(selection.borderTreatment()).isEqualTo("multicolor");
	}

	@Test
	void colorlessNonArtifactNonLand_selectsColorlessBorder() {
		FrameSelection selection = selector.select(
			"Creature — Eldrazi", "", "m15", "Emrakul", null);

		assertThat(selection.borderTreatment()).isEqualTo("colorless");
	}

	@Test
	void artifactType_selectsArtifactBorderRegardlessOfColor() {
		FrameSelection selection = selector.select(
			"Artifact — Equipment", "R", "m15", "Sword", null);

		assertThat(selection.templateSlot()).isEqualTo("artifact");
		assertThat(selection.borderTreatment()).isEqualTo("artifact");
	}

	@Test
	void landType_selectsLandTemplate() {
		FrameSelection selection = selector.select(
			"Basic Land — Forest", "", "m15", "Forest", null);

		assertThat(selection.templateSlot()).isEqualTo("land");
	}

	@Test
	void nicknamePresent_usesNicknameAsTitleAndNameAsSubtitle() {
		FrameSelection selection = selector.select(
			"Creature — Bear", "G", "m15", "Grizzly Bears", "Ashcrown the Devourer");

		assertThat(selection.title()).isEqualTo("Ashcrown the Devourer");
		assertThat(selection.subtitle()).isEqualTo("Grizzly Bears");
	}

	@Test
	void familyMissingSlot_fallsBackToDefaultFamily() {
		FrameSelector selectorWithoutFamily = new FrameSelector(Set.of()); // no families support planeswalker

		FrameSelection selection = selectorWithoutFamily.select(
			"Legendary Planeswalker — Jace", "U", "nonexistent-family", "Jace", null);

		assertThat(selection.frameFamily()).isEqualTo(FrameSelector.DEFAULT_FAMILY);
	}
}
