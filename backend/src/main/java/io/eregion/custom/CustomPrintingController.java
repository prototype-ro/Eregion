package io.eregion.custom;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.eregion.auth.CurrentUser;
import io.eregion.card.CardRepository;
import io.eregion.common.ApiException;
import io.eregion.custom.CustomPrintingRepository.CustomPrinting;
import io.eregion.custom.CustomPrintingRepository.Image;

/** A player's own card art, such as proxies, that can be used in place of a Scryfall printing. */
@RestController
@RequestMapping("/api")
public class CustomPrintingController {

	static final int MAX_BYTES = 10 * 1024 * 1024;
	/** All of one player's images together, so many large files cannot fill the database. */
	static final long MAX_TOTAL_BYTES = 500L * 1024 * 1024;
	static final int MAX_PER_USER = 300;
	static final int MAX_LABEL = 60;

	private final CustomPrintingRepository repository;
	private final CardRepository cards;

	public CustomPrintingController(CustomPrintingRepository repository, CardRepository cards) {
		this.repository = repository;
		this.cards = cards;
	}

	/** All of the player's custom art, so a page can show which cards have some. */
	@GetMapping("/custom-printings")
	public List<CustomPrinting> all(@AuthenticationPrincipal Jwt jwt) {
		return repository.list(CurrentUser.id(jwt), null);
	}

	@GetMapping("/cards/{cardId}/custom-printings")
	public List<CustomPrinting> forCard(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cardId) {
		return repository.list(CurrentUser.id(jwt), cardId);
	}

	@PostMapping("/cards/{cardId}/custom-printings")
	@ResponseStatus(HttpStatus.CREATED)
	public CustomPrinting upload(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cardId,
			@RequestParam("file") MultipartFile file, @RequestParam(defaultValue = "") String label) throws IOException {
		UUID userId = CurrentUser.id(jwt);
		cards.findById(cardId).orElseThrow(() -> ApiException.notFound("Card"));
		if (file.isEmpty()) {
			throw ApiException.badRequest("Choose an image file");
		}
		if (file.getSize() > MAX_BYTES) {
			throw ApiException.badRequest("Images can be at most 10 MB");
		}
		byte[] data = file.getBytes();
		String type = ImageSniffer.contentType(data).orElseThrow(() -> ApiException.badRequest("Only PNG, JPEG and WebP images are accepted"));
		if (repository.count(userId) >= MAX_PER_USER) {
			throw ApiException.conflict("You can keep up to " + MAX_PER_USER + " custom arts. Delete some first");
		}
		if (repository.totalBytes(userId) + data.length > MAX_TOTAL_BYTES) {
			throw ApiException.conflict("Your custom art takes up the 500 MB you can use. Delete some first");
		}
		UUID id = repository.insert(userId, cardId, cleanLabel(label), type, data);
		return repository.findOwned(id, userId).orElseThrow();
	}

	@DeleteMapping("/custom-printings/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		repository.findOwned(id, CurrentUser.id(jwt)).orElseThrow(() -> ApiException.notFound("Custom art"));
		repository.delete(id);
	}

	/**
	 * The image itself. Served as exactly the type we checked, with headers that stop a browser from
	 * guessing a different type or running anything in it.
	 */
	@GetMapping("/custom-printings/{id}/image")
	public ResponseEntity<byte[]> image(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		Image image = repository.imageFor(id, CurrentUser.id(jwt)).orElseThrow(() -> ApiException.notFound("Custom art"));
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(image.contentType()))
				.cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate().immutable())
				.header("X-Content-Type-Options", "nosniff")
				.header("Content-Security-Policy", "default-src 'none'; sandbox")
				.body(image.data());
	}

	static String cleanLabel(String label) {
		String cleaned = label == null ? "" : label.trim().replaceAll("\\s+", " ");
		if (cleaned.isEmpty()) {
			return "Custom";
		}
		return cleaned.length() > MAX_LABEL ? cleaned.substring(0, MAX_LABEL) : cleaned;
	}
}
