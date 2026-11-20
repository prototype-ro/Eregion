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
import io.eregion.ratelimit.RateLimits;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import io.eregion.custom.CustomPrintingRepository.Image;

/** A player's own card art, such as proxies, that can be used in place of a Scryfall printing. */
@RestController
@RequestMapping("/api")
public class CustomPrintingController {

	static final int MAX_BYTES = 10 * 1024 * 1024;
	static final int MAX_PER_USER = 300;
	static final int MAX_LABEL = 60;
	/**
	 * A card scan is about 750 x 1050 pixels; a print-quality one about 2500 x 3500. Anything far past that is no card art,
	 * and a tiny file can declare a huge size that stalls whoever opens it.
	 */
	static final int MAX_SIDE = 8000;
	static final long MAX_PIXELS = 25_000_000L;
	private static final Logger log = LoggerFactory.getLogger(CustomPrintingController.class);

	private final CustomPrintingRepository repository;
	private final CardRepository cards;
	private final RateLimits limits;
	private final ArtStorage storage;
	/** All of one player's images together, so many large files cannot fill the database. */
	private final long maxPerUserBytes;
	/** All art on the site. Uploads pause when it is reached, so a wave of sign-ups cannot fill the disk. */
	private final long maxSiteBytes;

	public CustomPrintingController(CustomPrintingRepository repository, CardRepository cards, RateLimits limits, ArtStorage storage,
			@Value("${eregion.art.per-user-mb:100}") long perUserMb, @Value("${eregion.art.site-mb:20480}") long siteMb) {
		this.repository = repository;
		this.cards = cards;
		this.limits = limits;
		this.storage = storage;
		this.maxPerUserBytes = perUserMb * 1024 * 1024;
		this.maxSiteBytes = siteMb * 1024 * 1024;
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
		limits.upload(userId);
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
		int[] size = ImageSniffer.dimensions(data, type).orElseThrow(() -> ApiException.badRequest("That image could not be read. Save it again as PNG, JPEG or WebP"));
		if (size[0] < 1 || size[1] < 1 || size[0] > MAX_SIDE || size[1] > MAX_SIDE || (long) size[0] * size[1] > MAX_PIXELS) {
			throw ApiException.badRequest("Images can be at most " + MAX_SIDE + " pixels on a side and 25 megapixels. This one is " + size[0] + " x " + size[1]);
		}
		if (repository.totalBytes(userId) + data.length > maxPerUserBytes) {
			throw ApiException.conflict("Your custom art takes up the " + maxPerUserBytes / (1024 * 1024) + " MB you can use. Delete some first");
		}
		long site = repository.siteBytes();
		if (site + data.length > maxSiteBytes) {
			log.warn("Custom art upload refused: the site holds {} MB of art, the limit is {} MB", site / (1024 * 1024), maxSiteBytes / (1024 * 1024));
			throw ApiException.unavailable("Art uploads are paused while we make room. Try again in a few days");
		}
		if (site + data.length > maxSiteBytes * 8 / 10) {
			log.warn("Custom art is at {} MB of the {} MB the site allows", (site + data.length) / (1024 * 1024), maxSiteBytes / (1024 * 1024));
		}
		UUID id = repository.insert(userId, cardId, cleanLabel(label), type, data, !storage.usesBucket());
		if (storage.usesBucket()) {
			try {
				storage.putInBucket(id, data, type);
			}
			catch (RuntimeException ex) {
				// The row must not point at bytes that never arrived.
				repository.delete(id);
				log.warn("Could not store art {} in the bucket", id, ex);
				throw ApiException.unavailable("Could not store the image right now. Try again in a moment");
			}
		}
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
		Image image = repository.imageFor(id, CurrentUser.idOrNull(jwt)).orElseThrow(() -> ApiException.notFound("Custom art"));
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(image.contentType()))
				.cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate().immutable())
				.header("X-Content-Type-Options", "nosniff")
				.header("Content-Security-Policy", "default-src 'none'; sandbox")
				.body(storage.read(image.id(), image.storedIn(), image.data()));
	}

	static String cleanLabel(String label) {
		String cleaned = label == null ? "" : label.trim().replaceAll("\\s+", " ");
		if (cleaned.isEmpty()) {
			return "Custom";
		}
		return cleaned.length() > MAX_LABEL ? cleaned.substring(0, MAX_LABEL) : cleaned;
	}
}
