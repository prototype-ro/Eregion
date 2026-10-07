package io.eregion.config;

import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

import io.eregion.auth.SessionCookie;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Finds the login token on a request: an Authorization header first (for tools and scripts), then
 * the session cookie. Sign in, sign up and sign out never look at a token, so a stale cookie cannot
 * lock someone out of signing in again.
 */
final class SessionTokenResolver implements BearerTokenResolver {

	private final DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();

	@Override
	public String resolve(HttpServletRequest request) {
		if (request.getRequestURI().startsWith("/api/auth/")) {
			return null;
		}
		String fromHeader = header.resolve(request);
		return fromHeader != null ? fromHeader : SessionCookie.read(request);
	}
}
