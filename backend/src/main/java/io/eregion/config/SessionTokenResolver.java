package io.eregion.config;

import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

import io.eregion.auth.SessionCookie;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Finds the login token on a request: an Authorization header first (for tools and scripts), then the session
 * cookie. Sign in, sign up and sign out never look at a token, so a stale cookie cannot lock someone out of
 * signing in again.
 *
 * Public pages work with or without a login. On those paths a token that is no good, say an expired cookie,
 * is ignored and the visitor is treated as signed out, instead of being refused a page anyone may read.
 */
final class SessionTokenResolver implements BearerTokenResolver {

	private final DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();
	private final JwtDecoder decoder;

	SessionTokenResolver(JwtDecoder decoder) {
		this.decoder = decoder;
	}

	@Override
	public String resolve(HttpServletRequest request) {
		String path = request.getRequestURI();
		if (path.startsWith("/api/auth/")) {
			return null;
		}
		String fromHeader = header.resolve(request);
		String token = fromHeader != null ? fromHeader : SessionCookie.read(request);
		if (token != null && isOptional(request.getMethod(), path)) {
			try {
				decoder.decode(token);
			}
			catch (JwtException ex) {
				return null;
			}
		}
		return token;
	}

	/** Pages anyone may read. A signed in visitor still gets what is theirs, such as their own custom art. */
	static boolean isOptional(String method, String path) {
		if (!"GET".equals(method)) {
			return false;
		}
		return path.equals("/api/explore") || path.startsWith("/api/explore/")
				|| (path.startsWith("/api/custom-printings/") && path.endsWith("/image"));
	}
}
