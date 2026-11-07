package io.eregion.card;

import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.common.AdvisoryLock;
import io.eregion.common.AppSyncStateRepository;

/**
 * Loads Scryfall's whole "oracle cards" bulk-data file (one row per unique card name, paper and digital alike)
 * into our own catalog, so a search or a decklist import can answer from our database for almost any real card
 * without ever calling the live Scryfall API. That API is only needed afterward for the handful of cards too new
 * to be in the last bulk file, and for prices, which the bulk file does not carry reliably.
 */
@Service
public class BulkCatalogSyncService {

	private static final String JOB = "bulk-catalog";
	private static final long LOCK_KEY = 0x45726567_04L;
	private static final Logger log = LoggerFactory.getLogger(BulkCatalogSyncService.class);
	/** Far fewer cards than Scryfall's real catalog means the download failed or was truncated, not that the game shrank. */
	private static final int MIN_PLAUSIBLE = 20_000;

	private final ScryfallClient scryfall;
	private final CardRepository cards;
	private final AppSyncStateRepository syncState;
	private final AdvisoryLock lock;
	private final boolean enabled;
	private final int minAgeHours;

	public BulkCatalogSyncService(ScryfallClient scryfall, CardRepository cards, AppSyncStateRepository syncState, AdvisoryLock lock,
			@Value("${eregion.bulk-catalog.enabled:true}") boolean enabled,
			@Value("${eregion.bulk-catalog.min-age-hours:168}") int minAgeHours) {
		this.scryfall = scryfall;
		this.cards = cards;
		this.syncState = syncState;
		this.lock = lock;
		this.enabled = enabled;
		this.minAgeHours = minAgeHours;
	}

	/**
	 * Once a week by default: the whole catalog barely changes between Magic sets, so there is no reason to spend
	 * the (still throttled) per-card requests this replaces more often than that.
	 */
	@Scheduled(initialDelayString = "${eregion.bulk-catalog.initial-delay-ms:180000}", fixedDelayString = "${eregion.bulk-catalog.every-ms:86400000}")
	public void scheduled() {
		if (!enabled) {
			return;
		}
		try {
			boolean ran = lock.runIfFree(LOCK_KEY, () -> {
				boolean fresh = syncState.lastSynced(JOB).map(at -> Duration.between(at, Instant.now()).toHours() < minAgeHours).orElse(false);
				if (!fresh) {
					sync();
				}
			});
			if (!ran) {
				log.info("Bulk catalog job skipped: another server is running it");
			}
		}
		catch (RuntimeException ex) {
			// A failed run keeps the catalog from the last good one and tries again at the next interval.
			log.warn("Bulk catalog sync failed", ex);
		}
	}

	/**
	 * Downloads the whole oracle-cards file and adds any card whose name we do not already have. A name already in
	 * the catalog is left exactly as it is: a deck may be pinning a specific printing or piece of art for it, and
	 * Scryfall's own "most recognizable" pick for a name can differ from what was already stored. Returns how many
	 * cards the download offered (for the plausibility check), not how many were new.
	 */
	public int sync() {
		Instant start = Instant.now();
		String uri = scryfall.bulkDataUri("oracle_cards");
		int[] seen = { 0 };
		int[] added = { 0 };
		scryfall.streamBulkData(uri, card -> {
			if (card.id() == null || card.name() == null) {
				return;
			}
			seen[0]++;
			added[0] += cards.insertIfMissing(ScryfallMapper.toCard(card));
		});
		if (seen[0] < MIN_PLAUSIBLE) {
			throw new IllegalStateException("Only " + seen[0] + " cards came back from the bulk download, not recording this as a successful run");
		}
		syncState.recordRun(JOB);
		log.info("Bulk catalog sync: {} cards seen, {} new cards added in {} s", seen[0], added[0], Duration.between(start, Instant.now()).toSeconds());
		return seen[0];
	}
}
