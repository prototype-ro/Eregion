package io.eregion.deck;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.common.AdvisoryLock;

/**
 * Empties what has been in the trash for more than 30 days: whole decks, and deleted versions. Version trash was only
 * cleared when another version of the same deck was deleted, so a deck left alone kept its old trash forever.
 */
@Service
public class TrashPurgeService {

	private static final long LOCK_KEY = 0x45726567_06L;
	private static final Logger log = LoggerFactory.getLogger(TrashPurgeService.class);

	private final DeckRepository decks;
	private final AdvisoryLock lock;

	public TrashPurgeService(DeckRepository decks, AdvisoryLock lock) {
		this.decks = decks;
		this.lock = lock;
	}

	@Scheduled(initialDelayString = "${eregion.trash-purge.initial-delay-ms:300000}", fixedDelayString = "${eregion.trash-purge.every-ms:21600000}")
	public void scheduled() {
		try {
			lock.runIfFree(LOCK_KEY, this::purge);
		}
		catch (RuntimeException ex) {
			log.warn("Trash purge failed", ex);
		}
	}

	public void purge() {
		List<UUID> expired = decks.expiredTrash();
		expired.forEach(decks::delete);
		int versions = decks.purgeExpiredVersionTrash();
		if (!expired.isEmpty() || versions > 0) {
			log.info("Trash purge removed {} decks and {} versions older than 30 days", expired.size(), versions);
		}
	}
}
