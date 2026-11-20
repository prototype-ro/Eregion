package io.eregion.follow;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.auth.Mailer;
import io.eregion.common.AdvisoryLock;

/**
 * Once a week, one email per follower listing the followed decks that published a new version since the last email,
 * with a link to each and a one-click way to stop. Nothing is sent to someone with nothing new.
 */
@Service
public class DigestService {

	private static final long LOCK_KEY = 0x45726567_08L;
	private static final Logger log = LoggerFactory.getLogger(DigestService.class);

	private final FollowRepository follows;
	private final Mailer mail;
	private final AdvisoryLock lock;
	private final String publicUrl;

	public DigestService(FollowRepository follows, Mailer mail, AdvisoryLock lock, @Value("${eregion.public-url:http://localhost:3000}") String publicUrl) {
		this.follows = follows;
		this.mail = mail;
		this.lock = lock;
		this.publicUrl = publicUrl;
	}

	/** Mondays at 14:00 UTC by default (late morning in the Americas, evening in Europe). */
	@Scheduled(cron = "${eregion.digest.cron:0 0 14 * * MON}", zone = "UTC")
	public void scheduled() {
		try {
			lock.runIfFree(LOCK_KEY, this::send);
		}
		catch (RuntimeException ex) {
			log.warn("Weekly digest failed", ex);
		}
	}

	public int send() {
		int sent = 0;
		for (FollowRepository.Recipient recipient : follows.recipients()) {
			List<FollowRepository.Change> changes = follows.changes(recipient.userId());
			if (changes.isEmpty()) {
				continue;
			}
			mail.send(recipient.email(), subject(changes), body(changes, recipient));
			changes.forEach(change -> follows.markNotified(recipient.userId(), change.deckId(), change.to()));
			sent++;
		}
		if (sent > 0) {
			log.info("Weekly digest sent to {} players", sent);
		}
		return sent;
	}

	static String subject(List<FollowRepository.Change> changes) {
		return changes.size() == 1 ? changes.get(0).name() + " has a new version" : changes.size() + " decks you follow have new versions";
	}

	String body(List<FollowRepository.Change> changes, FollowRepository.Recipient recipient) {
		StringBuilder text = new StringBuilder("New versions of decks you follow on Eregion:\n\n");
		for (FollowRepository.Change change : changes) {
			text.append(change.name()).append(" by ").append(change.ownerName()).append(": now version ").append(change.to());
			if (change.from() != null) {
				text.append(" (was ").append(change.from()).append(")");
			}
			text.append("\n").append(publicUrl).append("/explore/").append(change.deckId()).append("\n\n");
		}
		text.append("You get this because you follow these decks. Stop all of these emails: ")
				.append(publicUrl).append("/unsubscribe?token=").append(recipient.token()).append("\n");
		return text.toString();
	}
}
