package io.eregion.admin;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.auth.Mailer;

/**
 * Keeps an eye on what fails quietly: background jobs that stopped running (stale prices, a catalog that no longer
 * grows), a database that is getting large, and art near its budget. The admin page shows the state; problems are
 * logged and, with EREGION_MODERATION_EMAIL set, emailed to the owner at most once a day each.
 */
@Service
public class SystemWatch {

	/** A background job, when it last ran, and how long it may go without running before that is a problem. */
	public record Job(String name, Instant lastRun, long staleAfterHours, boolean stale) {
	}

	public record Status(List<Job> jobs, long databaseBytes, long artBytes, long artBudgetBytes, int users, int publicDecks, int openReports,
			int bracketBacklog, List<String> problems) {
	}

	private static final Logger log = LoggerFactory.getLogger(SystemWatch.class);

	private final JdbcClient jdbc;
	private final Mailer mail;
	private final String ownerEmail;
	private final long databaseWarnBytes;
	private final long artBudgetBytes;
	private final Map<String, Instant> lastAlerted = new ConcurrentHashMap<>();

	public SystemWatch(JdbcClient jdbc, Mailer mail, @Value("${eregion.moderation.email:}") String ownerEmail,
			@Value("${eregion.ops.database-warn-gb:10}") long databaseWarnGb, @Value("${eregion.art.site-mb:20480}") long artSiteMb) {
		this.jdbc = jdbc;
		this.mail = mail;
		this.ownerEmail = ownerEmail;
		this.databaseWarnBytes = databaseWarnGb * 1024 * 1024 * 1024;
		this.artBudgetBytes = artSiteMb * 1024 * 1024;
	}

	public Status status() {
		List<Job> jobs = List.of(
				job("Card catalog (Scryfall bulk file)", "SELECT synced_at FROM app_sync_state WHERE job = 'bulk-catalog'", 8 * 24),
				job("Prices", "SELECT synced_at FROM app_sync_state WHERE job = 'price-refresh'", 48),
				job("Card roles (Scryfall Tagger)", "SELECT max(synced_at) FROM card_functional_tags WHERE source = 'scryfall'", 72),
				job("Game Changers and extra turns", "SELECT max(synced_at) FROM bracket_flag_names", 72));
		long database = jdbc.sql("SELECT pg_database_size(current_database())").query(Long.class).single();
		long art = jdbc.sql("SELECT COALESCE(SUM(size_bytes), 0) FROM custom_printings").query(Long.class).single();
		int users = jdbc.sql("SELECT COUNT(*) FROM users").query(Integer.class).single();
		int publicDecks = jdbc.sql("SELECT COUNT(*) FROM decks WHERE visibility = 'public' AND deleted_at IS NULL").query(Integer.class).single();
		int openReports = jdbc.sql("SELECT COUNT(*) FROM deck_reports WHERE resolved_at IS NULL").query(Integer.class).single();
		int backlog = jdbc.sql("""
				SELECT COUNT(*) FROM decks d WHERE d.published_version_id IS NOT NULL AND d.deleted_at IS NULL
				   AND NOT EXISTS (SELECT 1 FROM version_brackets b WHERE b.version_id = d.published_version_id)
				""").query(Integer.class).single();

		List<String> problems = new ArrayList<>();
		jobs.stream().filter(Job::stale).forEach(j -> problems.add(j.name() + " has not run since " + (j.lastRun() == null ? "it started" : j.lastRun())));
		if (database > databaseWarnBytes) {
			problems.add("The database is " + database / (1024 * 1024) + " MB, over the " + databaseWarnBytes / (1024 * 1024) + " MB warning line");
		}
		if (art > artBudgetBytes * 8 / 10) {
			problems.add("Uploaded art is " + art / (1024 * 1024) + " MB of its " + artBudgetBytes / (1024 * 1024) + " MB budget");
		}
		return new Status(jobs, database, art, artBudgetBytes, users, publicDecks, openReports, backlog, problems);
	}

	private Job job(String name, String sql, long staleAfterHours) {
		java.sql.Timestamp at = jdbc.sql(sql).query(java.sql.Timestamp.class).optional().orElse(null);
		Instant last = at == null ? null : at.toInstant();
		return new Job(name, last, staleAfterHours, last == null || Duration.between(last, Instant.now()).toHours() > staleAfterHours);
	}

	/** Every hour: log what is wrong, and tell the owner once a day per problem. Jobs that never ran are a new server. */
	@Scheduled(initialDelayString = "${eregion.ops.watch-initial-delay-ms:3600000}", fixedDelayString = "${eregion.ops.watch-every-ms:3600000}")
	public void watch() {
		try {
			for (String problem : status().problems()) {
				if (problem.endsWith("since it started")) {
					continue;
				}
				log.warn("System watch: {}", problem);
				Instant last = lastAlerted.get(problem);
				if (!ownerEmail.isBlank() && (last == null || last.isBefore(Instant.now().minus(Duration.ofDays(1))))) {
					lastAlerted.put(problem, Instant.now());
					mail.send(ownerEmail, "Eregion needs a look", problem + "\n\nThe admin page (/admin) shows the state of every job.");
				}
			}
		}
		catch (RuntimeException ex) {
			log.warn("System watch failed", ex);
		}
	}
}
