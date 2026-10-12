package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ConfigHashTest {

	@Test
	void theSameFilesAlwaysGiveTheSameHash() {
		assertThat(ConfigHash.of(FunctionalTagMapping.RESOURCE, FunctionalRules.RESOURCE))
				.isEqualTo(ConfigHash.of(FunctionalTagMapping.RESOURCE, FunctionalRules.RESOURCE))
				.hasSize(64);
	}

	@Test
	void differentFilesGiveDifferentHashes() {
		assertThat(ConfigHash.of(FunctionalTagMapping.RESOURCE)).isNotEqualTo(ConfigHash.of(FunctionalRules.RESOURCE));
	}

	@Test
	void aMissingFileIsAnErrorNotAnEmptyHash() {
		assertThatThrownBy(() -> ConfigHash.of("/nope.json")).isInstanceOf(IllegalStateException.class);
	}
}
