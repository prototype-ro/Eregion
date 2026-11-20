package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.eregion.auth.UserRepository;
import io.eregion.common.ApiException;
import io.eregion.deck.DeckDtos.ApplyChangesRequest;
import io.eregion.deck.DeckDtos.BranchDto;
import io.eregion.deck.DeckDtos.CreateDeckRequest;
import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckDtos.MergeRequest;
import io.eregion.deck.DeckDtos.SaveVersionRequest;
import io.eregion.deck.DeckDtos.VersionDetail;
import io.eregion.deck.DeckDtos.VisibilityRequest;
import io.eregion.support.PostgresTest;

/**
 * The rules version history promises, against a real database: one winner when saves race, history never rewritten,
 * branches and merges, deleting and restoring versions, the public version protected, and deleting a deck leaving
 * nothing behind. Each service call runs in its own transaction, as it does behind the API.
 */
class VersionHistoryTest extends PostgresTest {

	private static DeckService service;
	private static DeckRepository decks;
	private static TransactionTemplate tx;
	private static UUID sol;
	private static UUID island;
	private static UUID counterspell;
	private static UUID ponder;

	private UUID user;

	@BeforeAll
	static void wire() {
		decks = new DeckRepository(jdbc, new JdbcTemplate(dataSource));
		service = new DeckService(decks, new UserRepository(jdbc));
		tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
		sol = card("Sol Ring", "Artifact");
		island = card("Island", "Land");
		counterspell = card("Counterspell", "Instant");
		ponder = card("Ponder", "Sorcery");
	}

	@BeforeEach
	void newPlayer() {
		String email = "history-" + UUID.randomUUID() + "@example.com";
		user = jdbc.sql("INSERT INTO users (email, password_hash, display_name, email_verified) VALUES (:email, 'x', 'Player', true) RETURNING id")
				.param("email", email).query(UUID.class).single();
	}

	private static UUID card(String name, String type) {
		return jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, type_line, primary_type, commander_legality)
				VALUES (gen_random_uuid(), :name, :type, :type, 'legal')
				ON CONFLICT (lower(name)) DO UPDATE SET name = EXCLUDED.name RETURNING id
				""").param("name", name).param("type", type).query(UUID.class).single();
	}

	private static DeckCardInput line(UUID card, int quantity) {
		return new DeckCardInput(card, quantity, "main", null, List.of(), null);
	}

	private <T> T inTx(Supplier<T> work) {
		return tx.execute(status -> work.get());
	}

	private UUID newDeck(DeckCardInput... cards) {
		return inTx(() -> service.create(user, new CreateDeckRequest("History", "commander", "start", List.of(cards)))).id();
	}

	private VersionDetail save(UUID deck, Integer from, String branch, DeckCardInput... cards) {
		return inTx(() -> service.saveVersion(deck, user, new SaveVersionRequest(null, List.of(cards), from, branch)));
	}

	private BranchDto branch(UUID deck, String name) {
		return inTx(() -> service.timeline(deck, user)).branches().stream().filter(b -> b.name().equals(name)).findFirst().orElseThrow();
	}

	private static HttpStatus statusOf(Runnable call) {
		try {
			call.run();
			return HttpStatus.OK;
		}
		catch (ApiException ex) {
			return ex.status();
		}
	}

	@Test
	void savesRacingFromTheSameVersionHaveOneWinnerAndBurnNoNumbers() throws Exception {
		UUID deck = newDeck(line(sol, 1));
		ExecutorService pool = Executors.newFixedThreadPool(6);
		List<Future<HttpStatus>> results = new ArrayList<>();
		for (int i = 0; i < 6; i++) {
			int copies = i + 2;
			Callable<HttpStatus> attempt = () -> statusOf(() -> save(deck, 1, null, line(sol, 1), line(island, copies)));
			results.add(pool.submit(attempt));
		}
		pool.shutdown();
		List<HttpStatus> statuses = new ArrayList<>();
		for (Future<HttpStatus> result : results) {
			statuses.add(result.get());
		}

		assertThat(statuses).filteredOn(HttpStatus.OK::equals).hasSize(1);
		assertThat(statuses).filteredOn(HttpStatus.CONFLICT::equals).hasSize(5);
		assertThat(jdbc.sql("SELECT version_number FROM deck_versions WHERE deck_id = :d ORDER BY version_number")
				.param("d", deck).query(Integer.class).list()).containsExactly(1, 2);
		VersionDetail next = save(deck, 2, null, line(sol, 1));
		assertThat(next.versionNumber()).isEqualTo(3);
	}

	@Test
	void savingFromAnOlderVersionNeedsABranchAndNeverRewritesHistory() {
		UUID deck = newDeck(line(sol, 1));
		save(deck, 1, null, line(sol, 1), line(island, 5));

		assertThat(statusOf(() -> save(deck, 1, null, line(sol, 1), line(ponder, 1)))).isEqualTo(HttpStatus.CONFLICT);

		VersionDetail forked = save(deck, 1, "Blue", line(sol, 1), line(ponder, 1));
		assertThat(forked.versionNumber()).isEqualTo(3);
		assertThat(branch(deck, "Blue").forkedFromVersion()).isEqualTo(1);
		assertThat(inTx(() -> service.version(deck, user, 2)).cards()).extracting(DeckDtos.DeckCardLine::name).containsExactlyInAnyOrder("Sol Ring", "Island");
	}

	@Test
	void applyingInPlaceIsRefusedOnceSomethingGrewFromTheVersion() {
		UUID deck = newDeck(line(sol, 1));
		save(deck, 1, null, line(sol, 1), line(island, 2));

		assertThat(statusOf(() -> inTx(() -> service.applyChanges(deck, user, 1, new ApplyChangesRequest(null, List.of(line(sol, 1), line(ponder, 1)))))))
				.isEqualTo(HttpStatus.CONFLICT);
		VersionDetail applied = inTx(() -> service.applyChanges(deck, user, 2, new ApplyChangesRequest(null, List.of(line(island, 3)))));
		assertThat(applied.versionNumber()).isEqualTo(2);
		assertThat(applied.cards()).extracting(DeckDtos.DeckCardLine::name).containsExactly("Island");
	}

	@Test
	void mergingTakesOneSidedChangesAndAsksAboutConflicts() {
		UUID deck = newDeck(line(sol, 1), line(island, 5));
		save(deck, 1, "Side", line(sol, 1), line(island, 3), line(ponder, 1));
		save(deck, 1, null, line(sol, 1), line(island, 7));
		BranchDto side = branch(deck, "Side");
		int mainHead = 3;
		int sideHead = 2;

		assertThat(statusOf(() -> inTx(() -> service.merge(deck, user, new MergeRequest(side.id(), mainHead, sideHead, Map.of(), null, false, null)))))
				.isEqualTo(HttpStatus.BAD_REQUEST);
		String islandKey = island + "|main";
		VersionDetail merged = inTx(() -> service.merge(deck, user, new MergeRequest(side.id(), mainHead, sideHead, Map.of(islandKey, "theirs"), null, false, null)));

		assertThat(merged.cards()).extracting(c -> c.name() + " " + c.quantity()).containsExactlyInAnyOrder("Sol Ring 1", "Island 3", "Ponder 1");
		assertThat(statusOf(() -> inTx(() -> service.merge(deck, user, new MergeRequest(side.id(), mainHead, sideHead, Map.of(islandKey, "ours"), null, false, null)))))
				.isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void aDeletedVersionClosesUpHistoryAndComesBackAsItWas() {
		UUID deck = newDeck(line(sol, 1));
		save(deck, 1, null, line(sol, 1), line(island, 2));
		save(deck, 2, null, line(sol, 1), line(island, 3));

		inTx(() -> service.deleteVersion(deck, user, 2));
		assertThat(inTx(() -> service.versions(deck, user))).extracting(DeckDtos.VersionSummary::versionNumber).containsExactlyInAnyOrder(1, 3);

		inTx(() -> service.undoDeleteVersion(deck, user, 2));
		assertThat(inTx(() -> service.version(deck, user, 2)).cards()).extracting(c -> c.name() + " " + c.quantity()).containsExactlyInAnyOrder("Sol Ring 1", "Island 2");
		assertThat(save(deck, 3, null, line(sol, 1)).versionNumber()).isEqualTo(4);
	}

	@Test
	void thePublicVersionCannotBeDeleted() {
		UUID deck = newDeck(line(sol, 1));
		save(deck, 1, null, line(sol, 1), line(island, 2));
		inTx(() -> service.setVisibility(deck, user, new VisibilityRequest("public", 1)));

		assertThat(statusOf(() -> inTx(() -> service.deleteVersion(deck, user, 1)))).isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void aTrashedDeckIsHiddenUntilRestoredAndPurgingRemovesEverything() {
		UUID deck = newDeck(line(sol, 1));
		save(deck, 1, "Side", line(sol, 1), line(ponder, 1));
		inTx(() -> service.setVisibility(deck, user, new VisibilityRequest("public", 1)));

		inTx(() -> {
			service.delete(deck, user);
			return null;
		});
		assertThat(statusOf(() -> inTx(() -> service.get(deck, user)))).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(inTx(() -> service.trash(user))).extracting(DeckDtos.TrashedDeck::id).containsExactly(deck);

		inTx(() -> {
			service.restore(deck, user);
			return null;
		});
		assertThat(inTx(() -> service.get(deck, user)).visibility()).isEqualTo("public");

		inTx(() -> {
			service.delete(deck, user);
			return null;
		});
		jdbc.sql("UPDATE decks SET deleted_at = now() - interval '31 days' WHERE id = :d").param("d", deck).update();
		new TrashPurgeService(decks, new io.eregion.common.AdvisoryLock(dataSource)).purge();
		for (String table : List.of("decks WHERE id", "deck_versions WHERE deck_id", "deck_branches WHERE deck_id")) {
			assertThat(jdbc.sql("SELECT COUNT(*) FROM " + table + " = :d").param("d", deck).query(Integer.class).single()).as(table).isZero();
		}
	}
}
