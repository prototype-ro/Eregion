package io.eregion.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import io.eregion.auth.SessionCookie;
import jakarta.servlet.http.Cookie;

class SameOriginFilterTest {

	private final SameOriginFilter filter = new SameOriginFilter(List.of("http://localhost:3000"));

	private MockHttpServletResponse run(MockHttpServletRequest request) throws Exception {
		MockHttpServletResponse response = new MockHttpServletResponse();
		filter.doFilter(request, response, new MockFilterChain());
		return response;
	}

	private static MockHttpServletRequest request(String method, boolean cookie) {
		MockHttpServletRequest request = new MockHttpServletRequest(method, "/api/decks");
		if (cookie) {
			request.setCookies(new Cookie(SessionCookie.NAME, "token"));
		}
		return request;
	}

	@Test
	void aForgedCrossSitePostWithTheCookieIsRefused() throws Exception {
		MockHttpServletRequest request = request("POST", true);
		request.addHeader("Origin", "https://evil.example");

		assertThat(run(request).getStatus()).isEqualTo(403);
	}

	@Test
	void aPostWithTheCookieAndNoOriginIsRefused() throws Exception {
		assertThat(run(request("DELETE", true)).getStatus()).isEqualTo(403);
	}

	@Test
	void aPostFromOurOwnSiteGoesThrough() throws Exception {
		MockHttpServletRequest request = request("PUT", true);
		request.addHeader("Origin", "http://localhost:3000");

		assertThat(run(request).getStatus()).isEqualTo(200);
	}

	@Test
	void readingDataNeedsNoOrigin() throws Exception {
		assertThat(run(request("GET", true)).getStatus()).isEqualTo(200);
	}

	@Test
	void anAuthorizationHeaderIsNotForgeableSoItSkipsTheCheck() throws Exception {
		MockHttpServletRequest request = request("POST", true);
		request.addHeader("Authorization", "Bearer abc");

		assertThat(run(request).getStatus()).isEqualTo(200);
	}

	@Test
	void requestsWithoutTheCookieAreLeftToTheLoginRules() throws Exception {
		assertThat(run(request("POST", false)).getStatus()).isEqualTo(200);
	}
}
