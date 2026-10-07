package io.eregion.auth;

/** Sends a plain text email. */
public interface Mailer {

	void send(String to, String subject, String body);
}
