package io.eregion.ratelimit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import jakarta.servlet.http.HttpServletRequest;

/** Works out which address a request came from. */
final class ClientIp {

	/** Sent by the site's own proxy (frontend/src/proxy.ts) when the site runs on another host, such as Vercel. */
	static final String SECRET_HEADER = "X-Eregion-Proxy";
	static final String ADDRESS_HEADER = "X-Eregion-Client-Ip";

	private ClientIp() {
	}

	/**
	 * The visitor's address. When the request carries the shared proxy secret, the site's proxy says who the
	 * visitor is: once the site and the API run on different hosts, that is the only place the address survives.
	 * Otherwise it is the connection's address, or with trustProxy the address the proxy says it saw. That proxy
	 * appends the caller to the end of the list, so the last entry is the one to believe: earlier ones can be
	 * written by the caller.
	 */
	static String of(HttpServletRequest request, boolean trustProxy, String proxySecret) {
		if (proxySecret != null && !proxySecret.isBlank() && matches(request.getHeader(SECRET_HEADER), proxySecret)) {
			String address = request.getHeader(ADDRESS_HEADER);
			if (address != null && !address.isBlank() && address.trim().length() <= 64) {
				return address.trim();
			}
		}
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

	static String of(HttpServletRequest request, boolean trustProxy) {
		return of(request, trustProxy, null);
	}

	/** Compares in constant time, so response times give away nothing about the secret. */
	private static boolean matches(String sent, String secret) {
		return sent != null && MessageDigest.isEqual(sent.getBytes(StandardCharsets.UTF_8), secret.getBytes(StandardCharsets.UTF_8));
	}
}
