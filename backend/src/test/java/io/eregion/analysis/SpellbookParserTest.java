package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.ComboInfo;
import io.eregion.analysis.AnalysisDtos.Combos;

class SpellbookParserTest {

	private static String sample() throws IOException {
		try (var in = SpellbookParserTest.class.getResourceAsStream("/spellbook-sample.json")) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
	}

	@Test
	void readsAnIncludedComboWithItsPiecesAndWhatItProduces() throws IOException {
		Combos combos = SpellbookParser.parse(sample(), Set.of("demonic consultation", "thassa's oracle"));
		assertThat(combos.available()).isTrue();
		assertThat(combos.included()).hasSize(1);
		ComboInfo combo = combos.included().get(0);
		assertThat(combo.cards()).containsExactlyInAnyOrder("Demonic Consultation", "Thassa's Oracle");
		assertThat(combo.missing()).isEmpty();
		assertThat(combo.produces()).contains("Win the game");
		assertThat(combo.winsOrLoops()).isTrue();
		assertThat(combo.manaValueNeeded()).isEqualTo(3);
	}

	@Test
	void anAlmostCompleteComboIsOneAwayWhenExactlyOnePieceIsMissing() throws IOException {
		Combos combos = SpellbookParser.parse(sample(), Set.of("thassa's oracle"));
		assertThat(combos.oneCardAway()).isNotEmpty();
		assertThat(combos.oneCardAway()).allSatisfy(combo -> assertThat(combo.missing()).hasSize(1));
		assertThat(combos.oneCardAway()).allSatisfy(combo -> assertThat(combo.cards()).contains("Thassa's Oracle"));
	}

	@Test
	void combosNeedingATemplateOrIllegalInCommanderAreDropped() {
		String body = """
				{"results":{"included":[
				 {"id":"1","status":"OK","requires":[{"template":{"name":"any creature"}}],"legalities":{"commander":true},"uses":[{"card":{"name":"A"}},{"card":{"name":"B"}}],"produces":[]},
				 {"id":"2","status":"OK","requires":[],"legalities":{"commander":false},"uses":[{"card":{"name":"A"}},{"card":{"name":"C"}}],"produces":[]},
				 {"id":"3","status":"OK","requires":[],"legalities":{"commander":true},"uses":[{"card":{"name":"A"}},{"card":{"name":"D"}}],"produces":[]}
				],"almostIncluded":[]}}""";
		Combos combos = SpellbookParser.parse(body, Set.of("a", "d"));
		assertThat(combos.included()).extracting(ComboInfo::id).containsExactly("3");
	}

	@Test
	void anUnreachableSpellbookIsAnUnavailableResultNotAnError() {
		ComboService service = new ComboService("http://127.0.0.1:1", "test", true);
		Combos combos = service.find(List.of("Sol Ring"), List.of("Atraxa, Praetors' Voice"));
		assertThat(combos.available()).isFalse();
		assertThat(combos.included()).isEmpty();
		// The failure is remembered, so a second ask answers at once with the same result.
		assertThat(service.find(List.of("Sol Ring"), List.of("Atraxa, Praetors' Voice"))).isSameAs(combos);
	}

	@Test
	void aDisabledServiceNeverCallsOut() {
		assertThat(new ComboService("http://127.0.0.1:1", "test", false).find(List.of("Sol Ring"), List.of()).available()).isFalse();
	}

	@Test
	void theCacheKeyIgnoresOrderAndSpelling() {
		assertThat(ComboService.key(List.of("Sol Ring", "Æther Vial"), List.of("Atraxa")))
				.isEqualTo(ComboService.key(List.of("aether vial", "SOL RING"), List.of("atraxa")));
		assertThat(ComboService.key(List.of("Sol Ring"), List.of())).isNotEqualTo(ComboService.key(List.of("Sol Ring"), List.of("Atraxa")));
	}
}
