package io.eregion.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordPolicyTest {

	private static String problem(String password) {
		return PasswordPolicy.problem(password, "player@example.com", "Rodrigo");
	}

	@Test
	void aLongUncommonPasswordIsFine() {
		assertThat(problem("violet-lantern-seventeen")).isNull();
		assertThat(problem("Tr0ub4dor&3 plus more")).isNull();
	}

	@Test
	void tooShortIsRefused() {
		assertThat(problem("short1!")).contains("at least 10");
		assertThat(problem(null)).contains("at least 10");
	}

	@Test
	void theMostCommonPasswordsAreRefusedIgnoringCase() {
		assertThat(problem("Password123")).contains("most common");
		assertThat(problem("QWERTYUIOP")).contains("most common");
		assertThat(problem("1234567890")).contains("most common");
		assertThat(problem("iloveyou1")).isNotNull();
	}

	@Test
	void repeatedCharactersAndSequencesAreRefused() {
		assertThat(problem("aaaaaaaaaaaa")).contains("different characters");
		assertThat(problem("abababababab")).contains("different characters");
		assertThat(problem("abcdefghijkl")).contains("in order");
		assertThat(problem("987654321098")).isNull(); // wraps, so not a straight run
	}

	@Test
	void yourOwnNamesAreRefused() {
		assertThat(problem("player-is-great-1")).contains("email name");
		assertThat(problem("my rodrigo password")).contains("display name");
	}

	@Test
	void shortNamesAreNotMatched() {
		assertThat(PasswordPolicy.problem("a perfectly fine phrase", "bo@example.com", "Bo")).isNull();
	}
}
