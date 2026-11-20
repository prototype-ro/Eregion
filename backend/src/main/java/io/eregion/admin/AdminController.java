package io.eregion.admin;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

/**
 * Moderation for the people who run the site: reports, accounts and uploaded art, without SQL by hand. Every action is
 * logged with who did it.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

	private static final Logger log = LoggerFactory.getLogger(AdminController.class);

	public record ResolveRequest(@Pattern(regexp = "dismiss|unpublish") String action) {
	}

	private final AdminAccess access;
	private final AdminRepository admin;
	private final SystemWatch watch;

	public AdminController(AdminAccess access, AdminRepository admin, SystemWatch watch) {
		this.access = access;
		this.admin = admin;
		this.watch = watch;
	}

	/** Background jobs, database and art size, and what needs attention. */
	@GetMapping("/system")
	public SystemWatch.Status system(@AuthenticationPrincipal Jwt jwt) {
		access.require(CurrentUser.id(jwt));
		return watch.status();
	}

	@GetMapping("/reports")
	public List<AdminRepository.Report> reports(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "false") boolean all) {
		access.require(CurrentUser.id(jwt));
		return admin.reports(all);
	}

	/** Dismiss a report, or take the reported deck off Explore; taking it down answers every open report of that deck. */
	@PostMapping("/reports/{reportId}/resolve")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resolve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID reportId, @Valid @RequestBody ResolveRequest request) {
		UUID by = CurrentUser.id(jwt);
		access.require(by);
		UUID deck = admin.reportDeck(reportId).orElseThrow(() -> ApiException.notFound("Report"));
		if ("unpublish".equals(request.action())) {
			admin.unpublish(deck);
			admin.resolveReportsOf(deck, "unpublished");
		}
		else {
			admin.resolveReport(reportId, "dismissed");
		}
		log.info("Moderation: {} {} report {} (deck {})", by, request.action(), reportId, deck);
	}

	@GetMapping("/users")
	public AdminRepository.UserSummary user(@AuthenticationPrincipal Jwt jwt, @RequestParam String email) {
		access.require(CurrentUser.id(jwt));
		return admin.userByEmail(email.trim()).orElseThrow(() -> ApiException.notFound("User"));
	}

	@PostMapping("/users/{userId}/disable")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void disable(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
		UUID by = CurrentUser.id(jwt);
		access.require(by);
		if (by.equals(userId)) {
			throw ApiException.badRequest("You cannot disable your own account");
		}
		admin.disable(userId);
		log.info("Moderation: {} disabled user {}", by, userId);
	}

	@PostMapping("/users/{userId}/enable")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void enable(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
		UUID by = CurrentUser.id(jwt);
		access.require(by);
		admin.enable(userId);
		log.info("Moderation: {} enabled user {}", by, userId);
	}

	/** Removes uploaded art, for a copyright claim or abuse. Saved versions that used it fall back to the card's own art. */
	@DeleteMapping("/custom-printings/{artId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteArt(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID artId) {
		UUID by = CurrentUser.id(jwt);
		access.require(by);
		if (!admin.deleteArt(artId)) {
			throw ApiException.notFound("Custom art");
		}
		log.info("Moderation: {} deleted custom art {}", by, artId);
	}
}
