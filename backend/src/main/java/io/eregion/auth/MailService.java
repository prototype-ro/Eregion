package io.eregion.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends the app's emails. With a mail server configured (spring.mail.host) they go out by SMTP. Without one,
 * as in local development, each message is written to the log with its link so it can be followed by hand.
 */
@Service
public class MailService implements Mailer {

	private static final Logger log = LoggerFactory.getLogger(MailService.class);

	private final ObjectProvider<JavaMailSender> smtp;
	private final String from;
	private final boolean production;

	public MailService(ObjectProvider<JavaMailSender> smtp, @Value("${eregion.mail.from:Eregion <no-reply@localhost>}") String from,
			@Value("${eregion.env:dev}") String environment, @Value("${spring.mail.host:}") String host) {
		// Spring Boot builds a sender for any spring.mail.host, even an empty one passed through by docker compose.
		this.smtp = host.isBlank() ? null : smtp;
		this.from = from;
		this.production = "production".equalsIgnoreCase(environment);
		// Without mail, nobody can confirm an address (needed to publish a deck) or reset a password, and the
		// one-use links would only exist in the log. Production refuses to start rather than fail quietly.
		if (production && (this.smtp == null || smtp.getIfAvailable() == null)) {
			throw new IllegalStateException("No mail server is configured. Set SPRING_MAIL_HOST, SPRING_MAIL_PORT, SPRING_MAIL_USERNAME and SPRING_MAIL_PASSWORD before running in production.");
		}
	}

	@Override
	public void send(String to, String subject, String body) {
		JavaMailSender sender = smtp == null ? null : smtp.getIfAvailable();
		if (sender == null) {
			log.info("MAIL (no mail server configured, not sent)\n  to: {}\n  subject: {}\n{}", to, subject, body);
			return;
		}
		try {
			SimpleMailMessage message = new SimpleMailMessage();
			message.setFrom(from);
			message.setTo(to);
			message.setSubject(subject);
			message.setText(body);
			sender.send(message);
		}
		catch (RuntimeException ex) {
			// A mail problem must not turn a request into an error, and must not reveal whether an address exists.
			// The address is personal data, so production logs only what was being sent.
			log.error("Could not send mail ({}) to {}: {}", subject, production ? "a user" : to, ex.getMessage());
		}
	}
}
