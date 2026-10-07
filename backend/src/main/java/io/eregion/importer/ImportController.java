package io.eregion.importer;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.importer.DeckImportService.ImportedDeck;
import io.eregion.ratelimit.RateLimits;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/import")
public class ImportController {

	public record UrlRequest(@NotBlank @Size(max = 300) String url) {
	}

	private final DeckImportService importer;
	private final RateLimits limits;

	public ImportController(DeckImportService importer, RateLimits limits) {
		this.importer = importer;
		this.limits = limits;
	}

	/** Reads a deck from a link to another site. The list it returns goes through the normal list import. */
	@PostMapping("/url")
	public ImportedDeck fromUrl(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UrlRequest request) {
		limits.urlImport(CurrentUser.id(jwt));
		return importer.fetch(request.url());
	}
}
