package io.eregion.analysis;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.analysis.AnalysisDtos.Analysis;
import io.eregion.analysis.AnalysisDtos.Bracket;
import io.eregion.analysis.AnalysisDtos.CardInput;
import io.eregion.analysis.AnalysisDtos.Combos;
import io.eregion.analysis.AnalysisDtos.Composition;
import io.eregion.analysis.AnalysisDtos.Consistency;
import io.eregion.analysis.AnalysisDtos.Engine;
import io.eregion.analysis.AnalysisDtos.Speed;
import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.card.NameNormalizer;
import io.eregion.common.ApiException;
import io.eregion.deck.Board;

/**
 * Analyses a deck as the builder holds it, saved or not: the caller sends card ids, boards and quantities, and everything else comes from
 * the catalog. The deck is not looked up, so an unsaved draft is analysed the same way as a saved version, and nothing here can read
 * a deck the caller does not own.
 */
@Service
public class AnalysisService {

	private final CardRepository cards;
	private final BracketFlagRepository flags;
	private final BracketLists lists = BracketLists.load();
	private final ComboService combos;
	private final EngineClassifier engineClassifier = EngineClassifier.load();

	public AnalysisService(CardRepository cards, BracketFlagRepository flags, ComboService combos) {
		this.cards = cards;
		this.flags = flags;
		this.combos = combos;
	}

	public Analysis analyze(List<CardInput> inputs) {
		List<AnalysisCard> deck = load(inputs);
		Composition composition = CompositionCalculator.compute(deck);
		Consistency consistency = ConsistencyCalculator.compute(deck);

		List<String> main = names(deck, "main");
		List<String> commanders = names(deck, "commander");
		Combos found = combos.find(main, commanders);

		List<AnalysisDtos.ComboInfo> known = found.available() ? found.included() : null;
		Speed speed = GoldfishSimulator.simulate(deck, known);
		Bracket bracket = BracketClassifier.classify(deck, known, composition.medianManaValue(), speed);
		Engine engine = engineClassifier.classify(deck);
		return new Analysis(composition, consistency, bracket, found, engine, speed, WinTurnEstimator.estimate(bracket, speed),
				DeckHealthCalculator.calculate(deck, consistency, engine), ArchenemyCalculator.calculate(deck, bracket.signals()));
	}

	private static List<String> names(List<AnalysisCard> deck, String board) {
		return deck.stream().filter(card -> board.equals(card.board())).map(AnalysisCard::name).distinct().toList();
	}

	private List<AnalysisCard> load(List<CardInput> inputs) {
		for (CardInput input : inputs) {
			Board.fromDb(input.board());
			if (input.quantity() < 1) {
				throw ApiException.badRequest("A card needs a quantity of at least 1");
			}
		}
		Map<UUID, Card> byId = new HashMap<>();
		cards.findByIds(inputs.stream().map(CardInput::cardId).collect(java.util.stream.Collectors.toSet())).forEach(card -> byId.put(card.id(), card));

		Set<String> lookups = new LinkedHashSet<>();
		byId.values().forEach(card -> {
			lookups.add(NameNormalizer.normalize(card.name()));
			lookups.add(NameNormalizer.normalize(BracketLists.frontFace(card.name())));
		});
		Map<String, Set<String>> stored = flags.flagsFor(lookups);

		List<AnalysisCard> deck = new ArrayList<>();
		for (CardInput input : inputs) {
			Card card = byId.get(input.cardId());
			if (card == null) {
				throw ApiException.badRequest("A card in this deck is not in the catalog");
			}
			Set<String> cardFlags = new HashSet<>(lists.flagsOf(card.name()));
			cardFlags.addAll(stored.getOrDefault(NameNormalizer.normalize(card.name()), Set.of()));
			cardFlags.addAll(stored.getOrDefault(NameNormalizer.normalize(BracketLists.frontFace(card.name())), Set.of()));
			deck.add(new AnalysisCard(card.name(), card.manaCost(), card.manaValue(), card.primaryType(), card.typeLine(), card.oracleText(),
					card.colorIdentity(), card.role(), input.quantity(), input.board(), cardFlags));
		}
		return deck;
	}
}
