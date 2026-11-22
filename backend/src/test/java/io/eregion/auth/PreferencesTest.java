package io.eregion.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.support.PostgresTest;

/** Variants start off and the tour is offered for every account, and both choices are kept on the account. */
class PreferencesTest extends PostgresTest {

	private static UUID user(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:e, 'x', :e) RETURNING id").param("e", email).query(UUID.class).single();
	}

	@Test
	void variantsAreOffUntilThePlayerTurnsThemOn() {
		Preferences preferences = new Preferences(jdbc);
		UUID player = user("prefs-variants@example.com");

		assertThat(preferences.of(player).variantsEnabled()).isFalse();
		assertThat(preferences.update(player, new Preferences.Update(true, null)).variantsEnabled()).isTrue();
		assertThat(preferences.of(player).variantsEnabled()).isTrue();
		assertThat(preferences.update(player, new Preferences.Update(false, null)).variantsEnabled()).isFalse();
	}

	@Test
	void theTourIsOfferedUntilFinishedOrSkipped() {
		Preferences preferences = new Preferences(jdbc);
		UUID player = user("prefs-tour@example.com");

		assertThat(preferences.of(player).tourDone()).isFalse();
		Preferences.Settings after = preferences.update(player, new Preferences.Update(null, true));
		assertThat(after.tourDone()).isTrue();
		// A partial update leaves the other setting alone.
		assertThat(after.variantsEnabled()).isFalse();
	}

	@Test
	void anUnknownAccountIsNotFound() {
		assertThatThrownBy(() -> new Preferences(jdbc).of(UUID.randomUUID())).isInstanceOf(ApiException.class);
	}
}
