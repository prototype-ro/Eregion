package io.eregion.analysis;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import io.eregion.analysis.AnalysisDtos.Archenemy;
import io.eregion.analysis.AnalysisDtos.ArchenemyPattern;
import io.eregion.analysis.AnalysisDtos.Signals;

/**
 * How likely the deck is to make a table groan, from a short list of patterns known for it: attacking libraries, taxes and restrictions,
 * taking lands away, stealing, chained extra turns, repeated wipes, and winning out of nowhere with a combo. Each pattern adds points by
 * how many of its cards the deck holds, up to a cap, and the points add up to a level on a ten step scale. It is a conversation starter for
 * a pod to have before playing, not a verdict, and it is cut from the cards and the lists the app already has.
 */
public final class ArchenemyCalculator {

	public static final List<String> LEVELS = List.of("Chill", "Friendly", "Contender", "Spicy", "Pointed", "Sweaty", "Ruthless", "Menace", "Nemesis", "Archenemy");

	private static final Pattern MILL = Pattern.compile("(target (player|opponent)|each (opponent|player)|that player) mills? ");
	private static final Pattern THEFT = Pattern.compile("gain control of (target|each|all)");
	private static final Pattern DISCARD = Pattern.compile("(each (opponent|player)|target (player|opponent)) discards? ");
	private static final Pattern DRAIN = Pattern.compile("deals? \\d+ damage to each opponent|each opponent loses \\d+ life|each opponent loses x life");
	private static final Pattern TAX = Pattern.compile("can't cast|spells (your opponents cast )?cost \\{?\\d}? more|doesn't untap|skip (your|their|each|that) (untap|draw)");
	private static final Pattern LAND_DENIAL = Pattern.compile("destroy target (nonbasic )?land|each player sacrifices a land|lands? (you|they|target player) controls? (don't|doesn't) untap");

	private ArchenemyCalculator() {
	}

	private record Spec(String key, String label, String text, double perCard, double cap, int free) {
	}

	private static final Spec MILL_SPEC = new Spec("mill", "Mill", "Libraries only get smaller, and nobody can rebuild one.", 0.7, 3.0, 0);
	private static final Spec THEFT_SPEC = new Spec("theft", "Theft", "Taking other people's permanents is rarely forgiven.", 0.6, 2.5, 0);
	private static final Spec DISCARD_SPEC = new Spec("discard", "Hand attack", "Emptying hands makes the others do nothing for a while.", 0.4, 2.0, 0);
	private static final Spec DRAIN_SPEC = new Spec("drain", "Group drain", "Everyone loses life at once, and the pod can not choose who.", 0.4, 2.0, 2);
	private static final Spec TAX_SPEC = new Spec("stax", "Taxes and locks", "It slows the whole table down so it can catch up.", 0.7, 3.0, 0);
	private static final Spec WIPE_SPEC = new Spec("wipes", "Board wipes", "It resets the board again and again.", 0.4, 1.5, 2);
	private static final Spec TURNS_SPEC = new Spec("extra_turns", "Extra turns", "Everyone waits while one player takes more turns.", 0.6, 3.0, 0);
	private static final Spec FAST_SPEC = new Spec("fast_mana", "Fast mana", "A free start the others have to catch up with.", 0.5, 2.5, 0);
	private static final Spec TUTOR_SPEC = new Spec("tutors", "Tutors", "It finds the exact card it needs, game after game.", 0.3, 1.5, 4);

	public static Archenemy calculate(List<AnalysisCard> deck, Signals signals) {
		List<ArchenemyPattern> found = new ArrayList<>();
		add(found, MILL_SPEC, matching(deck, MILL));
		add(found, THEFT_SPEC, matching(deck, THEFT));
		add(found, DISCARD_SPEC, matching(deck, DISCARD));
		add(found, DRAIN_SPEC, matching(deck, DRAIN));

		List<String> locks = new ArrayList<>(matching(deck, TAX));
		deck.stream().filter(c -> c.counted() && c.hasRole("Stax") && !locks.contains(c.name())).forEach(c -> locks.add(c.name()));
		add(found, TAX_SPEC, locks);
		add(found, WIPE_SPEC, withRole(deck, "Board Wipe"));
		add(found, TURNS_SPEC, signals.extraTurnCards());
		add(found, FAST_SPEC, signals.fastManaCards());
		add(found, TUTOR_SPEC, withRole(deck, "Tutor"));

		List<String> denial = new ArrayList<>(signals.massLandDenialCards());
		matching(deck, LAND_DENIAL).stream().filter(name -> !denial.contains(name)).forEach(denial::add);
		if (!denial.isEmpty()) {
			double points = Math.min(4.0, signals.massLandDenial() * 2.0 + (denial.size() - signals.massLandDenialCards().size()) * 0.5);
			found.add(new ArchenemyPattern("land_denial", "Land denial", "Taking lands away ends games before they begin.", round(points), limit(denial)));
		}
		if (signals.winCombos() != null && signals.winCombos() > 0) {
			boolean early = signals.earlyTwoCardCombos() != null && signals.earlyTwoCardCombos() > 0;
			double points = Math.min(2.5, (early ? 2.0 : 0.8) + Math.max(0, signals.winCombos() - 1) * 0.2);
			found.add(new ArchenemyPattern("combo", "Combo win", "It can end the game out of nowhere with a combo.", round(points), List.of()));
		}

		found.sort(Comparator.comparingDouble(ArchenemyPattern::points).reversed().thenComparing(ArchenemyPattern::key));
		double score = round(Math.min(10.0, found.stream().mapToDouble(ArchenemyPattern::points).sum()));
		int level = (int) Math.min(LEVELS.size() - 1, Math.floor(score));
		return new Archenemy(score, level, LEVELS.get(level), LEVELS, found.stream().limit(4).toList());
	}

	private static void add(List<ArchenemyPattern> found, Spec spec, List<String> cards) {
		double points = Math.min(spec.cap(), Math.max(0, cards.size() - spec.free()) * spec.perCard());
		if (points > 0) {
			found.add(new ArchenemyPattern(spec.key(), spec.label(), spec.text(), round(points), limit(cards)));
		}
	}

	private static List<String> matching(List<AnalysisCard> deck, Pattern pattern) {
		return deck.stream()
				.filter(card -> card.counted() && pattern.matcher(card.oracleText().toLowerCase(Locale.ROOT)).find())
				.map(AnalysisCard::name).distinct().toList();
	}

	private static List<String> withRole(List<AnalysisCard> deck, String role) {
		return deck.stream().filter(card -> card.counted() && !card.isLand() && card.hasRole(role)).map(AnalysisCard::name).distinct().toList();
	}

	private static List<String> limit(List<String> cards) {
		return cards.stream().limit(8).toList();
	}

	private static double round(double value) {
		return Math.round(value * 100.0) / 100.0;
	}
}
