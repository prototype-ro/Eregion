package io.eregion.explore;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ExploreRepositoryTest {

	@Test
	void likeWildcardsInSearchTextAreEscaped() {
		assertThat(ExploreRepository.escape("100%_sure!")).isEqualTo("100!%!_sure!!");
	}

	@Test
	void plainTextIsUnchanged() {
		assertThat(ExploreRepository.escape("Atraxa")).isEqualTo("Atraxa");
	}
}
