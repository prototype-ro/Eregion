package io.eregion.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

/** Works out which address a request came from. */
final class ClientIp {

	private ClientIp() {
	}

	/**
	 * The connection's address, or with trustProxy the address the proxy says it saw. The proxy appends
	 * the caller to the end of the list, so the last entry is the one to believe: earlier ones can be
	 * written by the caller.
	 */
	static String of(HttpServletRequest request, boolean trustProxy) {
		if (trustProxy) {
			String forwarded = request.getHeader("X-Forwarded-For");
			if (forwarded != null && !forwarded.isBlank()) {
				String[] parts = forwarded.split(",");
				String last = parts[parts.length - 1].trim();
				if (!last.isEmpty() && last.length() <= 64) {
					return last;
				}
			}
		}
		return request.getRemoteAddr();
	}
}
