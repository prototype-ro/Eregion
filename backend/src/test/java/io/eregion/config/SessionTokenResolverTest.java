package io.eregion.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import io.eregion.auth.SessionCookie;
import jakarta.servlet.http.Cookie;

class SessionTokenResolverTest {

	private final SessionTokenResolver resolver = new SessionTokenResolver();

	private static MockHttpServletRequest request(String uri) {
		return new MockHttpServletRequest("GET", uri) {
			{
				setRequestURI(uri);
			}
		};
	}

	@Test
	void readsTheSessionCookie() {
		MockHttpServletRequest request = request("/api/decks");
		request.setCookies(new Cookie(SessionCookie.NAME, "from-cookie"));

		assertThat(resolver.resolve(request)).isEqualTo("from-cookie");
	}

	@Test
	void theAuthorizationHeaderWinsOverTheCookie() {
		MockHttpServletRequest request = request("/api/decks");
		request.setCookies(new Cookie(SessionCookie.NAME, "from-cookie"));
		request.addHeader("Authorization", "Bearer from-header");

		assertThat(resolver.resolve(request)).isEqualTo("from-header");
	}

	@Test
	void signInPagesIgnoreAStaleCookie() {
		MockHttpServletRequest request = request("/api/auth/login");
		request.setCookies(new Cookie(SessionCookie.NAME, "expired"));

		assertThat(resolver.resolve(request)).isNull();
	}

	@Test
	void noTokenAnywhereMeansNull() {
		assertThat(resolver.resolve(request("/api/decks"))).isNull();
	}

	@Test
	void anEmptyCookieIsNotAToken() {
		MockHttpServletRequest request = request("/api/decks");
		request.setCookies(new Cookie(SessionCookie.NAME, ""));

		assertThat(resolver.resolve(request)).isNull();
	}
}
