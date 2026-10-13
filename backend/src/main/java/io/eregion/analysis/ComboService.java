package io.eregion.analysis;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import io.eregion.analysis.AnalysisDtos.Combos;
import io.eregion.card.NameNormalizer;

/**
 * Finds the combos in a deck through Commander Spellbook's public API. The answer is remembered per exact card list, so editing a deck
 * back and forth, or opening it again, does not ask twice. A Spellbook outage never breaks an analysis: the combo block is just marked
 * unavailable, and the failure is remembered briefly so a down service is not hit on every edit.
 */
@Service
public class ComboService {

	private static final Logger log = LoggerFactory.getLogger(ComboService.class);
	private static final int MAX_ENTRIES = 300;
	private static final Duration SUCCESS_TTL = Duration.ofHours(6);
	private static final Duration FAILURE_TTL = Duration.ofSeconds(60);

	private record Cached(Combos combos, Instant expires) {
	}

	private final RestClient http;
	private final boolean enabled;
	private final Map<String, Cached> cache = new LinkedHashMap<>() {
		@Override
		protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
			return size() > MAX_ENTRIES;
		}
	};

	public ComboService(@Value("${eregion.spellbook.url:https://backend.commanderspellbook.com}") String baseUrl,
			@Value("${eregion.spellbook.user-agent:${eregion.scryfall.user-agent}}") String userAgent,
			@Value("${eregion.spellbook.enabled:true}") boolean enabled) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build());
		factory.setReadTimeout(Duration.ofSeconds(10));
		this.http = RestClient.builder()
				.baseUrl(baseUrl)
				.requestFactory(factory)
				.defaultHeader("User-Agent", userAgent)
				.build();
		this.enabled = enabled;
	}

	/** The combos in this main-board list with these commanders. Never throws: a failure is a result with {@code available} false. */
	public Combos find(List<String> mainNames, List<String> commanderNames) {
		Combos unavailable = new Combos(false, List.of(), List.of());
		if (!enabled || (mainNames.isEmpty() && commanderNames.isEmpty())) {
			return unavailable;
		}
		String key = key(mainNames, commanderNames);
		synchronized (cache) {
			Cached hit = cache.get(key);
			if (hit != null && hit.expires().isAfter(Instant.now())) {
				return hit.combos();
			}
		}
		Combos found;
		Duration ttl;
		try {
			String body = post(Map.of("main", cards(mainNames), "commanders", cards(commanderNames)));
			Set<String> deck = new TreeSet<>();
			mainNames.forEach(name -> deck.add(NameNormalizer.normalize(name)));
			commanderNames.forEach(name -> deck.add(NameNormalizer.normalize(name)));
			found = SpellbookParser.parse(body, deck);
			ttl = SUCCESS_TTL;
		}
		catch (RuntimeException ex) {
			log.warn("Commander Spellbook lookup failed: {}", ex.toString());
			found = unavailable;
			ttl = FAILURE_TTL;
		}
		synchronized (cache) {
			cache.put(key, new Cached(found, Instant.now().plus(ttl)));
		}
		return found;
	}

	/** One retry on a fresh connection: a connection that sat idle can be reset by the server, which is not a reason to give up on combos. */
	private String post(Map<String, Object> request) {
		try {
			return send(request);
		}
		catch (RuntimeException first) {
			log.info("Commander Spellbook lookup retried: {}", first.toString());
			return send(request);
		}
	}

	private String send(Map<String, Object> request) {
		return http.post().uri("/find-my-combos").contentType(MediaType.APPLICATION_JSON).body(request).retrieve().body(String.class);
	}

	private static List<Map<String, Object>> cards(List<String> names) {
		List<Map<String, Object>> cards = new ArrayList<>();
		for (String name : names) {
			cards.add(Map.of("card", BracketLists.frontFace(name), "quantity", 1));
		}
		return cards;
	}

	static String key(List<String> mainNames, List<String> commanderNames) {
		TreeSet<String> main = new TreeSet<>(mainNames.stream().map(NameNormalizer::normalize).toList());
		TreeSet<String> commanders = new TreeSet<>(commanderNames.stream().map(NameNormalizer::normalize).toList());
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest((main + "|" + commanders).getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}
}
