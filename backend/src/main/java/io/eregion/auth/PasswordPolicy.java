package io.eregion.auth;

import java.util.Locale;
import java.util.Set;

/**
 * What makes a password too weak to accept. It stops the passwords that guessing tries first, without
 * rules like "one capital and one symbol" that push people toward predictable choices.
 */
public final class PasswordPolicy {

	public static final int MIN_LENGTH = 10;

	/** Passwords that appear at the top of every leaked list. Matched ignoring case. */
	private static final Set<String> COMMON = Set.of(
			"password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword", "qwerty", "qwertyuiop",
			"qwerty123", "qwerty1234", "qwertyuiop123", "1qaz2wsx", "1q2w3e4r", "1q2w3e4r5t", "zaq12wsx", "asdfghjkl", "asdfgh123", "zxcvbnm123",
			"letmein", "letmein123", "welcome", "welcome1", "welcome123", "admin", "admin123", "administrator", "iloveyou", "iloveyou1",
			"monkey", "monkey123", "dragon", "dragon123", "master", "master123", "sunshine", "princess", "football", "baseball", "superman",
			"batman", "trustno1", "abc123", "abc12345", "abcd1234", "abcdefgh", "abcdefghij", "changeme", "change-me", "default", "login",
			"hello123", "hello12345", "freedom", "whatever", "shadow", "michael", "jordan", "harley", "ranger", "buster", "thomas", "robert",
			"hunter", "hunter2", "starwars", "pokemon", "magicthegathering", "magic123", "planeswalker", "commander", "commander1", "mtgcommander",
			"eregion", "eregion123", "eregion1234", "1234567890", "12345678910", "0123456789", "9876543210", "0987654321", "1111111111", "0000000000",
			"correct horse", "correcthorse", "correct horse battery staple", "correcthorsebatterystaple", "123456789a", "a123456789", "1234567890a");

	private PasswordPolicy() {
	}

	/** Why the password is not acceptable, in words for the person choosing it, or null when it is fine. */
	public static String problem(String password, String email, String displayName) {
		if (password == null || password.length() < MIN_LENGTH) {
			return "Use at least " + MIN_LENGTH + " characters.";
		}
		String lower = password.toLowerCase(Locale.ROOT);
		if (COMMON.contains(lower)) {
			return "That password is on lists of the most common ones. Choose something less guessable.";
		}
		if (password.chars().distinct().count() < 4) {
			return "Use a mix of different characters, not the same few repeated.";
		}
		if (isSequence(lower)) {
			return "Do not use a run of keys or numbers in order.";
		}
		String local = email == null ? "" : email.toLowerCase(Locale.ROOT).split("@")[0];
		if (local.length() >= 4 && lower.contains(local)) {
			return "Do not include your email name in the password.";
		}
		if (displayName != null && displayName.trim().length() >= 4 && lower.contains(displayName.trim().toLowerCase(Locale.ROOT))) {
			return "Do not include your display name in the password.";
		}
		return null;
	}

	/** True for text that walks the alphabet or digits one step at a time, such as "abcdefghij" or "1234567890". */
	private static boolean isSequence(String text) {
		if (text.length() < 8) {
			return false;
		}
		int step = text.charAt(1) - text.charAt(0);
		if (Math.abs(step) != 1) {
			return false;
		}
		for (int i = 1; i < text.length(); i++) {
			if (text.charAt(i) - text.charAt(i - 1) != step) {
				return false;
			}
		}
		return true;
	}
}
