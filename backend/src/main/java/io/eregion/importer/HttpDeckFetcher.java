package io.eregion.importer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Fetches a deck over HTTPS. It only talks to the hosts of the supported sites, never follows a redirect
 * (a redirect could lead anywhere), gives up after ten seconds and reads at most 2 MB.
 */
@Component
public class HttpDeckFetcher implements DeckFetcher {

	static final int MAX_BYTES = 2 * 1024 * 1024;
	private static final Logger log = LoggerFactory.getLogger(HttpDeckFetcher.class);
	private static final Set<String> HOSTS = Set.of("archidekt.com", "api.scryfall.com", "tappedout.net", "www.mtggoldfish.com");

	private final HttpClient client = HttpClient.newBuilder()
			.followRedirects(HttpClient.Redirect.NEVER)
			.connectTimeout(Duration.ofSeconds(5))
			.build();

	@Override
	public Response get(URI uri, String accept) {
		if (!"https".equals(uri.getScheme()) || !HOSTS.contains(uri.getHost())) {
			throw new IllegalArgumentException("Refusing to fetch " + uri.getHost());
		}
		try {
			HttpRequest request = HttpRequest.newBuilder(uri)
					.timeout(Duration.ofSeconds(10))
					.header("Accept", accept)
					.header("User-Agent", "Eregion/0.1 (deck import for the person who pasted the link)")
					.GET()
					.build();
			HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
			try (InputStream in = response.body()) {
				ByteArrayOutputStream out = new ByteArrayOutputStream();
				byte[] buffer = new byte[8192];
				int read;
				while ((read = in.read(buffer)) != -1) {
					out.write(buffer, 0, read);
					if (out.size() > MAX_BYTES) {
						return new Response(413, "");
					}
				}
				return new Response(response.statusCode(), out.toString(StandardCharsets.UTF_8));
			}
		}
		catch (IOException | RuntimeException ex) {
			log.info("Could not read {}: {}", uri.getHost(), ex.getMessage());
			return new Response(0, "");
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			return new Response(0, "");
		}
	}
}
