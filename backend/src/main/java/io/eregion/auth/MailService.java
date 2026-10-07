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

	public MailService(ObjectProvider<JavaMailSender> smtp, @Value("${eregion.mail.from:Eregion <no-reply@localhost>}") String from) {
		this.smtp = smtp;
		this.from = from;
	}

	@Override
	public void send(String to, String subject, String body) {
		JavaMailSender sender = smtp.getIfAvailable();
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
			log.error("Could not send mail to {}: {}", to, ex.getMessage());
		}
	}
}
