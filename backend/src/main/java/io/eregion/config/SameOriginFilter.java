package io.eregion.config;

import java.io.IOException;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import io.eregion.auth.SessionCookie;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Cross-site request forgery protection for cookie logins. A request that changes data and relies on
 * the session cookie must come from one of our own pages. Browsers always say where such a request
 * came from in the Origin header, and other sites cannot fake it. Requests that carry an
 * Authorization header are not affected, because a forged request cannot add that header.
 */
final class SameOriginFilter extends OncePerRequestFilter {

	private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

	private final List<String> allowedOrigins;

	SameOriginFilter(List<String> allowedOrigins) {
		this.allowedOrigins = allowedOrigins;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		boolean usesCookie = SessionCookie.read(request) != null && request.getHeader("Authorization") == null;
		String origin = request.getHeader("Origin");
		if (usesCookie && !SAFE.contains(request.getMethod()) && (origin == null || !allowedOrigins.contains(origin))) {
			response.setStatus(HttpStatus.FORBIDDEN.value());
			response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
			response.getWriter().write("{\"title\":\"Forbidden\",\"status\":403,\"detail\":\"Requests that change data must come from the Eregion site\"}");
			return;
		}
		chain.doFilter(request, response);
	}
}
