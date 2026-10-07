package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.TestInstance;

import io.eregion.deck.DeckLegality.Line;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Runs every case in shared/legality-cases.json. The web app's legality.ts runs the same file, so the two
 * implementations are held to the same results and the same wording.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeckLegalityTest {

	private static final Path CASES = Path.of("..", "shared", "legality-cases.json");

	private static Line line(JsonNode node) {
		String name = node.get("name").asString();
		return new Line(UUID.nameUUIDFromBytes(name.getBytes()), name, node.get("board").asString(), node.get("quantity").asInt(),
				node.get("colorIdentity").asString(), node.get("typeLine").asString(), node.get("oracleText").asString(),
				node.get("commanderLegality").asString());
	}

	private static List<Line> build(JsonNode testCase) {
		List<Line> lines = new ArrayList<>();
		for (JsonNode node : testCase.get("lines")) {
			// Lines with the same name are the same card, so the id comes from the name alone.
			lines.add(line(node));
		}
		String identity = testCase.get("fillerIdentity").asString();
		for (int i = 0; i < testCase.get("filler").asInt(); i++) {
			lines.add(new Line(UUID.nameUUIDFromBytes(("Filler " + i).getBytes()), "Filler " + i, "main", 1, identity, "Instant", "", "legal"));
		}
		return lines;
	}

	@TestFactory
	Stream<DynamicTest> sharedCases() throws IOException {
		JsonNode root = JsonMapper.builder().build().readTree(Files.readString(CASES));
		List<DynamicTest> tests = new ArrayList<>();
		for (JsonNode testCase : root.get("cases")) {
			List<String> expected = new ArrayList<>();
			testCase.get("issues").forEach(issue -> expected.add(issue.asString()));
			tests.add(DynamicTest.dynamicTest(testCase.get("name").asString(), () -> assertThat(DeckLegality.issues(build(testCase))).isEqualTo(expected)));
		}
		return tests.stream();
	}

	@Test
	void theSharedFileHasEnoughCases() throws IOException {
		assertThat(JsonMapper.builder().build().readTree(Files.readString(CASES)).get("cases").size()).isGreaterThan(30);
	}

	@Test
	void identityListsTheCommandersColorsInGameOrder() {
		assertThat(DeckLegality.identity(List.of(
				new Line(UUID.randomUUID(), "A", "commander", 1, "GUB", "Legendary Creature", "", "legal"),
				new Line(UUID.randomUUID(), "B", "main", 1, "R", "Instant", "", "legal")))).isEqualTo("UBG");
		assertThat(DeckLegality.identity(List.of())).isEmpty();
	}

	@Test
	void copyLimitsReadTheCardText() {
		assertThat(DeckLegality.copyLimit(new Line(UUID.randomUUID(), "X", "main", 1, "", "Creature", "A deck can have up to nine cards named X.", "legal"))).isEqualTo(9);
		assertThat(DeckLegality.copyLimit(new Line(UUID.randomUUID(), "X", "main", 1, "", "Basic Land", "", "legal"))).isEqualTo(Integer.MAX_VALUE);
		assertThat(DeckLegality.copyLimit(new Line(UUID.randomUUID(), "X", "main", 1, "", "Creature", "", "legal"))).isEqualTo(1);
	}
}
