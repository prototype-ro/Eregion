package io.eregion.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;

import io.eregion.config.JwtProperties;

class SessionCookieTest {

	private static String header(SessionCookie cookie, boolean clear) {
		MockHttpServletResponse response = new MockHttpServletResponse();
		if (clear) {
			cookie.clear(response);
		}
		else {
			cookie.write(response, "the-token");
		}
		return response.getHeader(HttpHeaders.SET_COOKIE);
	}

	@Test
	void theLoginCookieCannotBeReadByScriptsOrSentFromOtherSites() {
		String set = header(new SessionCookie(new JwtProperties("x".repeat(32), 60), true, "dev"), false);

		assertThat(set).contains("eregion_session=the-token").contains("HttpOnly").contains("Secure")
				.contains("SameSite=Lax").contains("Path=/").contains("Max-Age=3600");
	}

	@Test
	void secureIsOptionalForLocalDevelopment() {
		assertThat(header(new SessionCookie(new JwtProperties("x".repeat(32), 60), false, "dev"), false)).doesNotContain("Secure");
	}

	@Test
	void signingOutExpiresTheCookie() {
		String set = header(new SessionCookie(new JwtProperties("x".repeat(32), 60), false, "dev"), true);

		assertThat(set).contains("eregion_session=;").contains("Max-Age=0").contains("HttpOnly");
	}

	@Test
	void productionIsAlwaysSecureWhateverTheSetting() {
		assertThat(header(new SessionCookie(new JwtProperties("x".repeat(32), 60), false, "production"), false)).contains("Secure");
	}
}
