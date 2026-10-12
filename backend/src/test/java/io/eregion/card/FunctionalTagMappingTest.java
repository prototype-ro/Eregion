package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class FunctionalTagMappingTest {

	private final FunctionalTagMapping mapping = new FunctionalTagMapping(List.of(
			new FunctionalTagMapping.Category("Board Wipe", List.of("board-wipe")),
			new FunctionalTagMapping.Category("Removal", List.of("removal")),
			new FunctionalTagMapping.Category("Ramp", List.of("ramp", "mana-rock"))));

	@Test
	void aCardKeepsTheHighestPriorityCategoryThatClaimsIt() {
		Map<String, String> result = mapping.assign(Map.of(
				"removal", List.of("Wrath of God", "Swords to Plowshares"),
				"board-wipe", List.of("Wrath of God"),
				"ramp", List.of("Sol Ring")));

		assertThat(result).containsEntry("wrath of god", "Board Wipe")
				.containsEntry("swords to plowshares", "Removal")
				.containsEntry("sol ring", "Ramp");
	}

	@Test
	void anyOfACategorysTagsIsEnoughAndNamesAreLowerCased() {
		Map<String, String> result = mapping.assign(Map.of("mana-rock", List.of("Arcane Signet")));

		assertThat(result).containsExactly(Map.entry("arcane signet", "Ramp"));
	}

	@Test
	void aCardWithNoTagIsNotAssignedAnything() {
		assertThat(mapping.assign(Map.of("something-else", List.of("Island")))).isEmpty();
	}

	@Test
	void theFileThatShipsLoadsAndListsEveryRoleOnce() {
		List<String> names = FunctionalTagMapping.load().names();

		assertThat(names).contains("Ramp", "Removal", "Board Wipe", "Card Draw").doesNotHaveDuplicates();
	}

	@Test
	void aCardKeepsEveryCategoryItHasInPriorityOrder() {
		Map<String, List<String>> result = mapping.assignAll(Map.of(
				"removal", List.of("Wrath of God", "Swords to Plowshares"),
				"board-wipe", List.of("Wrath of God"),
				"mana-rock", List.of("Wrath of God")));

		assertThat(result.get("wrath of god")).containsExactly("Board Wipe", "Removal", "Ramp");
		assertThat(result.get("swords to plowshares")).containsExactly("Removal");
	}

	@Test
	void priorityIsThePositionInTheFileAndUnknownCategoriesGoLast() {
		assertThat(mapping.priority("Board Wipe")).isLessThan(mapping.priority("Removal"));
		assertThat(mapping.priority("Removal")).isLessThan(mapping.priority("Ramp"));
		assertThat(mapping.priority("Something New")).isEqualTo(Integer.MAX_VALUE);
	}

	@Test
	void theShippedOrderKeepsRemovalAndRampAboveTutor() {
		FunctionalTagMapping shipped = FunctionalTagMapping.load();

		assertThat(shipped.priority("Removal")).isLessThan(shipped.priority("Tutor"));
		assertThat(shipped.priority("Ramp")).isLessThan(shipped.priority("Tutor"));
		assertThat(shipped.priority("Board Wipe")).isLessThan(shipped.priority("Removal"));
	}

	@Test
	void longTailRolesOnlyGoToCardsNoMainCategoryClaimed() {
		FunctionalTagMapping withTail = new FunctionalTagMapping(
				List.of(new FunctionalTagMapping.Category("Removal", List.of("removal"))),
				List.of(new FunctionalTagMapping.Category("Mill", List.of("mill")), new FunctionalTagMapping.Category("Burn", List.of("burn"))));
		Map<String, List<String>> byTag = Map.of(
				"removal", List.of("Swords to Plowshares"),
				"mill", List.of("Swords to Plowshares", "Lord of the Void"),
				"burn", List.of("Lord of the Void"));

		Map<String, List<String>> tail = withTail.assignLongTail(byTag, java.util.Set.of("swords to plowshares"));

		assertThat(tail).containsOnlyKeys("lord of the void");
		assertThat(tail.get("lord of the void")).containsExactly("Mill", "Burn");
		assertThat(withTail.priority("Mill")).isGreaterThan(withTail.priority("Removal")).isLessThan(withTail.priority("Burn"));
		assertThat(withTail.allTags()).containsExactly("removal", "mill", "burn");
	}

	@Test
	void theShippedFileHasALongTailBelowTheMainRoles() {
		FunctionalTagMapping shipped = FunctionalTagMapping.load();

		assertThat(shipped.longTail()).isNotEmpty();
		assertThat(shipped.priority("Burn")).isGreaterThan(shipped.priority("Lifegain"));
	}
}
