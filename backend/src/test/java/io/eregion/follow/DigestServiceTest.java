package io.eregion.follow;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.auth.Mailer;
import io.eregion.common.AdvisoryLock;
import io.eregion.support.PostgresTest;

/** The weekly email: only followed decks that published a new version, once each, and a working unsubscribe. */
class DigestServiceTest extends PostgresTest {

	private record Mail(String to, String subject, String body) {
	}

	private static UUID user(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name, email_verified) VALUES (:e, 'x', :e, true) RETURNING id")
				.param("e", email).query(UUID.class).single();
	}

	private static UUID publish(UUID deck, UUID branch, int number) {
		UUID version = jdbc.sql("INSERT INTO deck_versions (deck_id, branch_id, version_number) VALUES (:d, :b, :n) RETURNING id")
				.param("d", deck).param("b", branch).param("n", number).query(UUID.class).single();
		jdbc.sql("UPDATE decks SET visibility = 'public', published_version_id = :v, published_at = now() WHERE id = :d").param("v", version).param("d", deck).update();
		return version;
	}

	@Test
	void mailsNewVersionsOnceAndStopsWhenUnsubscribed() {
		UUID owner = user("digest-owner@example.com");
		UUID fan = user("digest-fan@example.com");
		UUID deck = jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:o, 'Followed deck') RETURNING id").param("o", owner).query(UUID.class).single();
		UUID branch = jdbc.sql("INSERT INTO deck_branches (deck_id, name, is_main) VALUES (:d, 'main', true) RETURNING id").param("d", deck).query(UUID.class).single();
		publish(deck, branch, 1);

		FollowRepository follows = new FollowRepository(jdbc);
		List<Mail> sent = new ArrayList<>();
		Mailer mailer = (to, subject, body) -> sent.add(new Mail(to, subject, body));
		DigestService digest = new DigestService(follows, mailer, new AdvisoryLock(dataSource), "https://eregion.example");

		assertThat(follows.follow(fan, deck)).isTrue();
		assertThat(follows.follow(owner, deck)).as("nobody follows their own deck").isFalse();
		assertThat(digest.send()).as("nothing new since following").isZero();

		publish(deck, branch, 2);
		assertThat(digest.send()).isEqualTo(1);
		assertThat(sent).singleElement().satisfies(mail -> {
			assertThat(mail.to()).isEqualTo("digest-fan@example.com");
			assertThat(mail.subject()).isEqualTo("Followed deck has a new version");
			assertThat(mail.body()).contains("now version 2 (was 1)", "https://eregion.example/explore/" + deck, "/unsubscribe?token=");
		});
		assertThat(digest.send()).as("each version is mailed once").isZero();

		publish(deck, branch, 3);
		UUID token = jdbc.sql("SELECT digest_token FROM users WHERE id = :u").param("u", fan).query(UUID.class).single();
		assertThat(follows.unsubscribe(token)).isTrue();
		assertThat(digest.send()).as("unsubscribed").isZero();
	}
}
