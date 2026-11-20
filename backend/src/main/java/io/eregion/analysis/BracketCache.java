package io.eregion.analysis;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.analysis.AnalysisDtos.CardInput;
import io.eregion.common.AdvisoryLock;

/**
 * Works out the bracket of the versions people see in lists, a few at a time in the background: each deck's latest
 * version and every published one, once they hold at least 60 cards (below that the bracket is not shown anywhere).
 */
@Service
public class BracketCache {

	private static final long LOCK_KEY = 0x45726567_07L;
	private static final int PER_RUN = 40;
	static final int MIN_CARDS = 60;
	private static final Logger log = LoggerFactory.getLogger(BracketCache.class);

	private final JdbcClient jdbc;
	private final AnalysisService analysis;
	private final AdvisoryLock lock;

	public BracketCache(JdbcClient jdbc, AnalysisService analysis, AdvisoryLock lock) {
		this.jdbc = jdbc;
		this.analysis = analysis;
		this.lock = lock;
	}

	@Scheduled(initialDelayString = "${eregion.bracket-cache.initial-delay-ms:90000}", fixedDelayString = "${eregion.bracket-cache.every-ms:300000}")
	public void scheduled() {
		try {
			lock.runIfFree(LOCK_KEY, this::fill);
		}
		catch (RuntimeException ex) {
			log.warn("Bracket cache run failed", ex);
		}
	}

	/** Works out the bracket of up to PER_RUN versions that are shown somewhere and have none yet. */
	public int fill() {
		List<UUID> pending = pending(PER_RUN);
		int done = 0;
		for (UUID versionId : pending) {
			try {
				store(versionId);
				done++;
			}
			catch (RuntimeException ex) {
				log.warn("Could not work out the bracket of version {}: {}", versionId, ex.getMessage());
			}
		}
		if (done > 0) {
			log.info("Bracket cache: worked out {} versions", done);
		}
		return done;
	}

	/** The versions shown in a list (each deck's latest, every published one) with 60 or more cards and no bracket yet. */
	List<UUID> pending(int limit) {
		return jdbc.sql("""
				SELECT v.id FROM (
				    (SELECT DISTINCT ON (d.id) x.id FROM decks d JOIN deck_versions x ON x.deck_id = d.id
				      WHERE d.deleted_at IS NULL ORDER BY d.id, x.version_number DESC)
				    UNION
				    SELECT d.published_version_id FROM decks d WHERE d.published_version_id IS NOT NULL AND d.deleted_at IS NULL
				) v
				 WHERE NOT EXISTS (SELECT 1 FROM version_brackets b WHERE b.version_id = v.id)
				   AND (SELECT COALESCE(SUM(dc.quantity), 0) FROM deck_version_cards dc
				         WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')) >= :min
				 LIMIT :limit
				""").param("min", MIN_CARDS).param("limit", limit).query(UUID.class).list();
	}

	private void store(UUID versionId) {
		List<CardInput> cards = jdbc.sql("SELECT card_id, board, quantity FROM deck_version_cards WHERE version_id = :v")
				.param("v", versionId)
				.query((rs, n) -> new CardInput(rs.getObject("card_id", UUID.class), rs.getString("board"), rs.getInt("quantity")))
				.list();
		var bracket = analysis.analyze(cards).bracket();
		if (bracket == null) {
			return;
		}
		jdbc.sql("""
				INSERT INTO version_brackets (version_id, bracket, name) VALUES (:v, :bracket, :name)
				ON CONFLICT (version_id) DO UPDATE SET bracket = EXCLUDED.bracket, name = EXCLUDED.name, computed_at = now()
				""").param("v", versionId).param("bracket", bracket.bracket()).param("name", bracket.name()).update();
	}
}
