package io.eregion.auth;

import java.time.Duration;
import java.time.Instant;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import io.eregion.config.JwtProperties;

@Service
public class TokenService {

	private final JwtEncoder encoder;
	private final JwtProperties properties;

	public TokenService(JwtEncoder encoder, JwtProperties properties) {
		this.encoder = encoder;
		this.properties = properties;
	}

	public String issue(User user) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer("eregion")
				.subject(user.id().toString())
				.issuedAt(now)
				.expiresAt(now.plus(Duration.ofMinutes(properties.ttlMinutes())))
				.claim("email", user.email())
				.claim("tv", user.tokenVersion())
				.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}
}
