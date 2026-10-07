package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.deck.SavePlanner.Append;
import io.eregion.deck.SavePlanner.Base;
import io.eregion.deck.SavePlanner.First;
import io.eregion.deck.SavePlanner.Fork;

class SavePlannerTest {

	private static final UUID BRANCH = UUID.randomUUID();
	private static final UUID VERSION = UUID.randomUUID();

	private static Base head() {
		return new Base(7, VERSION, BRANCH, true);
	}

	private static Base older() {
		return new Base(5, VERSION, BRANCH, false);
	}

	@Test
	void firstSaveOfAnEmptyDeckStartsMain() {
		assertThat(SavePlanner.plan(false, null, null)).isInstanceOf(First.class);
		assertThat(SavePlanner.plan(false, null, "ignored")).isInstanceOf(First.class);
	}

	@Test
	void anEmptyDeckHasNothingToStartFrom() {
		assertThatThrownBy(() -> SavePlanner.plan(false, head(), null)).isInstanceOf(ApiException.class);
	}

	@Test
	void aDeckWithVersionsNeedsToKnowTheBase() {
		assertThatThrownBy(() -> SavePlanner.plan(true, null, null))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("fromVersion");
	}

	@Test
	void savingFromTheNewestVersionExtendsItsBranch() {
		assertThat(SavePlanner.plan(true, head(), null)).isEqualTo(new Append(BRANCH, VERSION));
		assertThat(SavePlanner.plan(true, head(), "   ")).isEqualTo(new Append(BRANCH, VERSION));
	}

	@Test
	void savingFromAnOlderVersionIsRefusedUnlessItBecomesABranch() {
		assertThatThrownBy(() -> SavePlanner.plan(true, older(), null))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("Version 5")
				.hasMessageContaining("new branch");
		assertThat(SavePlanner.plan(true, older(), "Esper tempo")).isEqualTo(new Fork("Esper tempo", VERSION));
	}

	@Test
	void anyVersionCanForkIncludingTheNewest() {
		assertThat(SavePlanner.plan(true, head(), "  Dinosaurs ")).isEqualTo(new Fork("Dinosaurs", VERSION));
	}
}
