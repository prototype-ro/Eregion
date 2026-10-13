package io.eregion.analysis;

import java.util.List;
import java.util.Map;

/** The shapes of an analysis, as the API returns them. Every block is additive: a block that cannot be worked out is null. */
public final class AnalysisDtos {

	private AnalysisDtos() {
	}

	public record Composition(
			double medianManaValue,
			/** Coloured pips in the costs of the non-land cards, hybrids split between their colours. */
			Map<String, Double> pips,
			/** Cards that can make each colour (W U B R G) or colourless (C), restricted to the commander's identity. */
			Map<String, Integer> sources) {
	}

	public record Consistency(
			int libraryCards,
			int lands,
			int cheapRamp,
			double expectedOpeningLands,
			/** Chance of having at least t lands by turn t, on the play. */
			double landDropTurn2,
			double landDropTurn3,
			double landDropTurn4,
			double rampByTurn2,
			double rampByTurn3,
			double twoRampByTurn3,
			double keepableOpener,
			/** Null without a commander. */
			Double commanderOnCurve,
			/** Chance of at least one source of each colour of the identity by turn 3. */
			Map<String, Double> colorAccessTurn3) {
	}

	/** One combo from Commander Spellbook, with the cards the deck lacks (empty when it is complete). */
	public record ComboInfo(
			String id,
			List<String> cards,
			List<String> missing,
			List<String> produces,
			String description,
			String manaNeeded,
			Integer manaValueNeeded,
			/** Spellbook's own rating letter, passed through untouched. */
			String bracketTag,
			int popularity) {

		/**
		 * A combo that wins the game or drains the table outright, or loops into a win by damage, combat or milling. An infinite mana,
		 * draw or enter-the-battlefield loop is not this: it needs a payoff, and only helps once the deck has one.
		 */
		public boolean endsGame() {
			return produces.stream().anyMatch(effect -> {
				String text = effect.toLowerCase(java.util.Locale.ROOT);
				return text.contains("win the game") || text.contains("loses the game") || text.contains("lose the game")
						|| text.contains("infinite damage") || text.contains("infinite combat") || text.contains("lifeloss")
						|| text.contains("infinite mill");
			});
		}

		/** A combo that ends the game or loops without end. */
		public boolean winsOrLoops() {
			return produces.stream().anyMatch(effect -> {
				String text = effect.toLowerCase(java.util.Locale.ROOT);
				return text.contains("infinite") || text.contains("win the game");
			});
		}
	}

	/** Null on the analysis when the combo service could not be reached; {@code available} is then false. */
	public record Combos(boolean available, List<ComboInfo> included, List<ComboInfo> oneCardAway) {
	}

	public record Signals(
			int gameChangers,
			List<String> gameChangerCards,
			int massLandDenial,
			List<String> massLandDenialCards,
			int extraTurns,
			List<String> extraTurnCards,
			int tutors,
			int unconditionalTutors,
			int fastMana,
			List<String> fastManaCards,
			/** Null when combo data was unavailable, so "no combos" is never claimed without looking. */
			Integer twoCardCombos,
			Integer earlyTwoCardCombos,
			Integer winCombos,
			/** Combos that end the game by themselves. A loop that only makes mana or draws is counted in winCombos but not here. */
			Integer endingCombos,
			Integer endingTwoCardCombos,
			Integer earlyEndingTwoCardCombos,
			/** Tutors weighted by how freely they find a card: any card 1.0, a broad type 0.7, anything narrower 0.4. */
			Double weightedTutors,
			/** Spells that put a creature into play from a graveyard, which is a way to skip casting it. */
			Integer reanimation) {
	}

	/** A rule that sets a minimum bracket, with the cards that trip it. */
	public record Reason(String kind, int bracket, String text, List<String> cards) {
	}

	public record Bracket(
			/** The lowest bracket the rules allow for this list. */
			int floor,
			/** The bracket the speed signals suggest, before the rules are applied. */
			int estimated,
			/** The bracket shown: the higher of the two. */
			int bracket,
			String name,
			/** What decided it: speed, or the kind of the rule that set the floor. */
			String basis,
			double score,
			Map<String, Double> scoreParts,
			Signals signals,
			List<Reason> reasons,
			List<String> whatWouldChange,
			String note) {
	}

	public record Theme(String name, double score, List<String> cards) {
	}

	public record Engine(
			String primary,
			String description,
			/** The primary theme's score as a share of the top themes' total, 0 to 1. */
			double confidence,
			String runnerUp,
			/** The top two themes are close, so the label should not be stated with certainty. */
			boolean ambiguous,
			List<Theme> themes,
			/** The creature type most of the creatures share, or null. */
			String tribe,
			List<String> signatureCards) {
	}

	/**
	 * What many simulated games of the deck on its own showed. It measures how fast the deck sets up, not how fast it wins by damage.
	 * Null when the main board is too small to play.
	 */
	public record Speed(
			int games,
			/** Average mana left for spells on turns 1 to 8, after ramp has been played. */
			List<Double> manaByTurn,
			/** The turn the commander could first be cast, in the middle game. Null without a commander or when most games never get there. */
			Double commanderTurn,
			/** Chance the commander can be cast by turns 3 to 6, keyed by turn. */
			Map<String, Double> commanderByTurn,
			/** The turn a game-ending combo could first be executed, in the middle game. Null without such a combo or when most games never get there. */
			Double comboTurn,
			/** The average turn it could first be executed, counting a game that never gets there as turn 12. Null without such a combo. */
			Double comboMean,
			/** Chance a game-ending combo can be executed by turns 4, 6, 8 and 10, keyed by turn. Empty without such a combo. */
			Map<String, Double> comboByTurn,
			List<String> assumptions) {
	}

	/** The turn the deck is expected to close the game, on average, as a number of turns. */
	public record WinTurn(
			double turn,
			/** combo: a game-ending combo is quicker than the signals suggest. signals: read from the bracket's speed score. */
			String basis,
			/** The bracket whose turn range this turn falls in, 1 to 5. */
			int bracket) {
	}

	/** One measured thing about the deck, the range that is usual for it, and how far the deck is from that range. */
	public record HealthSpoke(String key, String label, double observed, double min, double max, int score, String hint, List<String> cards) {
	}

	public record HealthPillar(String key, String label, int score, List<HealthSpoke> spokes) {
	}

	public record DeckHealth(int score, List<HealthPillar> pillars, String note) {
	}

	public record ArchenemyPattern(String key, String label, String text, double points, List<String> cards) {
	}

	/** How much the deck is likely to annoy a table, from patterns that make games less fun for the others. */
	public record Archenemy(double score, int level, String name, List<String> levels, List<ArchenemyPattern> patterns) {
	}

	public record Analysis(Composition composition, Consistency consistency, Bracket bracket, Combos combos, Engine engine, Speed speed, WinTurn winTurn,
			DeckHealth health, Archenemy archenemy) {
	}

	public record CardInput(
			@jakarta.validation.constraints.NotNull java.util.UUID cardId,
			@jakarta.validation.constraints.NotBlank String board,
			@jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(99) int quantity) {
	}

	public record AnalysisRequest(
			@jakarta.validation.constraints.NotEmpty @jakarta.validation.constraints.Size(max = 500) List<@jakarta.validation.Valid CardInput> cards) {
	}
}
