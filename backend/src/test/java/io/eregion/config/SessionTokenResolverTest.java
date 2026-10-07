package io.eregion.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import io.eregion.auth.SessionCookie;
import jakarta.servlet.http.Cookie;

class SessionTokenResolverTest {

	/** Accepts only the token "good". */
	private static final JwtDecoder DECODER = token -> {
		if (!"good".equals(token)) {
			throw new BadJwtException("no");
		}
		return Jwt.withTokenValue(token).header("alg", "none").subject("s").build();
	};

	private final SessionTokenResolver resolver = new SessionTokenResolver(DECODER);

	private static MockHttpServletRequest request(String method, String uri) {
		var request = new MockHttpServletRequest(method, uri);
		request.setRequestURI(uri);
		return request;
	}

	private static MockHttpServletRequest withCookie(String method, String uri, String token) {
		var request = request(method, uri);
		request.setCookies(new Cookie(SessionCookie.NAME, token));
		return request;
	}

	@Test
	void readsTheSessionCookie() {
		assertThat(resolver.resolve(withCookie("GET", "/api/decks", "from-cookie"))).isEqualTo("from-cookie");
	}

	@Test
	void theAuthorizationHeaderWinsOverTheCookie() {
		var request = withCookie("GET", "/api/decks", "from-cookie");
		request.addHeader("Authorization", "Bearer from-header");

		assertThat(resolver.resolve(request)).isEqualTo("from-header");
	}

	@Test
	void signInPagesIgnoreAStaleCookie() {
		assertThat(resolver.resolve(withCookie("POST", "/api/auth/login", "expired"))).isNull();
	}

	@Test
	void noTokenAnywhereMeansNull() {
		assertThat(resolver.resolve(request("GET", "/api/decks"))).isNull();
	}

	@Test
	void anEmptyCookieIsNotAToken() {
		assertThat(resolver.resolve(withCookie("GET", "/api/decks", ""))).isNull();
	}

	@Test
	void aBadTokenOnAPrivatePathIsLeftForTheServerToRefuse() {
		assertThat(resolver.resolve(withCookie("GET", "/api/decks", "expired"))).isEqualTo("expired");
	}

	@Test
	void aBadTokenOnAPublicPageIsIgnoredSoTheVisitorStillSeesIt() {
		assertThat(resolver.resolve(withCookie("GET", "/api/explore", "expired"))).isNull();
		assertThat(resolver.resolve(withCookie("GET", "/api/explore/abc", "expired"))).isNull();
		assertThat(resolver.resolve(withCookie("GET", "/api/custom-printings/abc/image", "expired"))).isNull();
	}

	@Test
	void aGoodTokenOnAPublicPageIsStillUsedSoTheOwnerSeesTheirOwn() {
		assertThat(resolver.resolve(withCookie("GET", "/api/explore/abc", "good"))).isEqualTo("good");
		assertThat(resolver.resolve(withCookie("GET", "/api/custom-printings/abc/image", "good"))).isEqualTo("good");
	}

	@Test
	void writesToPublicPathsStillNeedAValidLogin() {
		assertThat(resolver.resolve(withCookie("POST", "/api/explore/abc/report", "expired"))).isEqualTo("expired");
		assertThat(resolver.resolve(withCookie("DELETE", "/api/custom-printings/abc", "expired"))).isEqualTo("expired");
	}

	@Test
	void onlyTheImagePathOfCustomPrintingsIsPublic() {
		assertThat(SessionTokenResolver.isOptional("GET", "/api/custom-printings")).isFalse();
		assertThat(SessionTokenResolver.isOptional("GET", "/api/custom-printings/abc")).isFalse();
		assertThat(SessionTokenResolver.isOptional("GET", "/api/custom-printings/abc/image")).isTrue();
		assertThat(SessionTokenResolver.isOptional("GET", "/api/exploreX")).isFalse();
	}
}
