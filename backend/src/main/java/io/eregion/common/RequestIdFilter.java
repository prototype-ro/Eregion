package io.eregion.common;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gives every request an id: the one a proxy in front already set (X-Request-Id), or a new one. It goes into every
 * log line written while the request runs, back to the caller in the X-Request-Id header, and into error answers, so a
 * player who reports "it said something went wrong" can quote the id that finds the log.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Request-Id";
	public static final String MDC_KEY = "requestId";
	/** An id from outside is only taken when it looks like one, so a header cannot write arbitrary text into the logs. */
	private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9._-]{8,64}");

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
		String given = request.getHeader(HEADER);
		String id = given != null && SAFE.matcher(given).matches() ? given : UUID.randomUUID().toString();
		MDC.put(MDC_KEY, id);
		response.setHeader(HEADER, id);
		try {
			chain.doFilter(request, response);
		}
		finally {
			MDC.remove(MDC_KEY);
		}
	}

	/** The id of the request being handled, or null outside one. */
	public static String current() {
		return MDC.get(MDC_KEY);
	}
}
