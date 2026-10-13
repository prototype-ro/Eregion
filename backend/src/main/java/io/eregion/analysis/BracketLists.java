package io.eregion.analysis;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import io.eregion.card.NameNormalizer;
import tools.jackson.databind.json.JsonMapper;

/** The curated card lists from {@code bracket-lists.json}, read once. Names are matched in their normalized form. */
public final class BracketLists {

	public static final String RESOURCE = "/bracket-lists.json";

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record Config(Map<String, List<String>> lists) {
	}

	private final Map<String, Set<String>> byFlag = new HashMap<>();

	public BracketLists(Map<String, List<String>> lists) {
		lists.forEach((flag, names) -> {
			Set<String> normalized = new HashSet<>();
			names.forEach(name -> {
				normalized.add(NameNormalizer.normalize(name));
				normalized.add(NameNormalizer.normalize(frontFace(name)));
			});
			byFlag.put(flag, normalized);
		});
	}

	public static BracketLists load() {
		try (InputStream in = BracketLists.class.getResourceAsStream(RESOURCE)) {
			if (in == null) {
				throw new IllegalStateException(RESOURCE + " is missing");
			}
			return new BracketLists(JsonMapper.builder().build().readValue(in, Config.class).lists());
		}
		catch (IOException | RuntimeException ex) {
			throw new IllegalStateException("Could not read " + RESOURCE, ex);
		}
	}

	/** The curated flags a card has, by its normalized name or that of its front face. */
	public Set<String> flagsOf(String cardName) {
		String full = NameNormalizer.normalize(cardName);
		String front = NameNormalizer.normalize(frontFace(cardName));
		Set<String> flags = new HashSet<>();
		byFlag.forEach((flag, names) -> {
			if (names.contains(full) || names.contains(front)) {
				flags.add(flag);
			}
		});
		return flags;
	}

	static String frontFace(String name) {
		int split = name.indexOf(" // ");
		return split < 0 ? name : name.substring(0, split);
	}
}
