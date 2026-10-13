package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class HypergeometricTest {

	@Test
	void atLeastOneOfTwoDrawsFromTen() {
		// 1 - C(5,2)/C(10,2) = 1 - 10/45
		assertThat(Hypergeometric.atLeast(10, 5, 2, 1)).isCloseTo(35.0 / 45.0, within(1e-9));
		assertThat(Hypergeometric.atLeast(10, 5, 2, 2)).isCloseTo(10.0 / 45.0, within(1e-9));
	}

	@Test
	void anAceInFiveCards() {
		assertThat(Hypergeometric.atLeast(52, 4, 5, 1)).isCloseTo(0.34115, within(1e-4));
	}

	@Test
	void distributionSumsToOne() {
		double sum = 0;
		for (int hits = 0; hits <= 7; hits++) {
			sum += Hypergeometric.exactly(99, 37, 7, hits);
		}
		assertThat(sum).isCloseTo(1.0, within(1e-9));
	}

	@Test
	void edgesAreClampedNotErrors() {
		assertThat(Hypergeometric.atLeast(99, 37, 7, 0)).isEqualTo(1);
		assertThat(Hypergeometric.atLeast(99, 3, 7, 4)).isZero();
		assertThat(Hypergeometric.atLeast(99, 37, 500, 2)).isGreaterThan(0.99);
		assertThat(Hypergeometric.atLeast(0, 0, 7, 1)).isZero();
	}

	@Test
	void betweenIsInclusive() {
		assertThat(Hypergeometric.between(99, 37, 7, 2, 5)).isCloseTo(
				Hypergeometric.exactly(99, 37, 7, 2) + Hypergeometric.exactly(99, 37, 7, 3)
						+ Hypergeometric.exactly(99, 37, 7, 4) + Hypergeometric.exactly(99, 37, 7, 5), within(1e-12));
	}
}
