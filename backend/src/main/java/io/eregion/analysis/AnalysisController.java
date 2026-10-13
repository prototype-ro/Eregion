package io.eregion.analysis;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.analysis.AnalysisDtos.Analysis;
import io.eregion.analysis.AnalysisDtos.AnalysisRequest;
import io.eregion.auth.CurrentUser;
import io.eregion.ratelimit.RateLimits;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/analysis")
public class AnalysisController {

	private final AnalysisService service;
	private final RateLimits limits;

	public AnalysisController(AnalysisService service, RateLimits limits) {
		this.service = service;
		this.limits = limits;
	}

	/** Analyses the cards of a draft or a saved version: bracket, consistency, composition, combos and what the deck is built around. */
	@PostMapping
	public Analysis analyze(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AnalysisRequest request) {
		limits.analysis(CurrentUser.id(jwt));
		return service.analyze(request.cards());
	}
}
