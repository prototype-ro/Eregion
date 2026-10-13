package io.eregion.analysis;

/** Drawing without replacement: the maths behind every opening-hand and early-turn figure. */
public final class Hypergeometric {

	private static final int MAX = 1000;
	private static final double[] LOG_FACTORIAL = new double[MAX + 1];

	static {
		for (int i = 2; i <= MAX; i++) {
			LOG_FACTORIAL[i] = LOG_FACTORIAL[i - 1] + Math.log(i);
		}
	}

	private Hypergeometric() {
	}

	private static double logChoose(int n, int k) {
		return LOG_FACTORIAL[n] - LOG_FACTORIAL[k] - LOG_FACTORIAL[n - k];
	}

	/** The chance of exactly {@code hits} marked cards in {@code draws} cards from a library of {@code population} holding {@code marked}. */
	public static double exactly(int population, int marked, int draws, int hits) {
		if (hits < 0 || hits > marked || hits > draws || draws - hits > population - marked) {
			return 0;
		}
		return Math.exp(logChoose(marked, hits) + logChoose(population - marked, draws - hits) - logChoose(population, draws));
	}

	/** The chance of at least {@code needed} marked cards. Out-of-range input is clamped, never an error. */
	public static double atLeast(int population, int marked, int draws, int needed) {
		if (needed <= 0) {
			return 1;
		}
		int pop = Math.max(0, Math.min(population, MAX));
		int mark = Math.max(0, Math.min(marked, pop));
		int n = Math.max(0, Math.min(draws, pop));
		if (mark < needed || n < needed) {
			return 0;
		}
		double total = 0;
		for (int hits = needed; hits <= Math.min(mark, n); hits++) {
			total += exactly(pop, mark, n, hits);
		}
		return Math.min(1, total);
	}

	/** The chance of between {@code low} and {@code high} marked cards, both included. */
	public static double between(int population, int marked, int draws, int low, int high) {
		double total = 0;
		for (int hits = Math.max(0, low); hits <= high; hits++) {
			total += exactly(population, marked, draws, hits);
		}
		return Math.min(1, total);
	}
}
