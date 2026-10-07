package io.eregion.auth;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import io.eregion.config.JwtProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The login token travels in an httpOnly cookie, so scripts on the page can never read it. The
 * cookie is SameSite=Lax and, outside local development, Secure.
 */
@Component
public class SessionCookie {

	public static final String NAME = "eregion_session";

	private final Duration lifetime;
	private final boolean secure;

	public SessionCookie(JwtProperties jwt, @Value("${eregion.auth.cookie-secure:false}") boolean secure) {
		this.lifetime = Duration.ofMinutes(jwt.ttlMinutes());
		this.secure = secure;
	}

	public void write(HttpServletResponse response, String token) {
		response.addHeader(HttpHeaders.SET_COOKIE, build(token, lifetime).toString());
	}

	public void clear(HttpServletResponse response) {
		response.addHeader(HttpHeaders.SET_COOKIE, build("", Duration.ZERO).toString());
	}

	/** The token in the request's session cookie, or null. */
	public static String read(HttpServletRequest request) {
		Cookie[] cookies = request.getCookies();
		if (cookies == null) {
			return null;
		}
		for (Cookie cookie : cookies) {
			if (NAME.equals(cookie.getName()) && !cookie.getValue().isEmpty()) {
				return cookie.getValue();
			}
		}
		return null;
	}

	private ResponseCookie build(String value, Duration maxAge) {
		return ResponseCookie.from(NAME, value)
				.httpOnly(true)
				.secure(secure)
				.sameSite("Lax")
				.path("/")
				.maxAge(maxAge)
				.build();
	}
}
