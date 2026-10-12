package io.eregion.card;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.json.JsonMapper;

/**
 * Turns Scryfall Tagger tags into the roles Eregion shows. The table lives in {@code functional-tags.json}, not here,
 * because it will need tuning. The order of the categories is their priority.
 */
public final class FunctionalTagMapping {

	public static final String RESOURCE = "/functional-tags.json";

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Category(String name, List<String> tags) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record Config(List<Category> categories, List<Category> longTail) {
	}

	private final List<Category> categories;
	private final List<Category> longTail;

	public FunctionalTagMapping(List<Category> categories) {
		this(categories, List.of());
	}

	public FunctionalTagMapping(List<Category> categories, List<Category> longTail) {
		this.categories = List.copyOf(categories);
		this.longTail = List.copyOf(longTail);
	}

	public static FunctionalTagMapping load() {
		try (InputStream in = FunctionalTagMapping.class.getResourceAsStream(RESOURCE)) {
			if (in == null) {
				throw new IllegalStateException(RESOURCE + " is missing");
			}
			Config config = JsonMapper.builder().build().readValue(in, Config.class);
			return new FunctionalTagMapping(config.categories(), config.longTail() == null ? List.of() : config.longTail());
		}
		catch (IOException | RuntimeException ex) {
			throw new IllegalStateException("Could not read " + RESOURCE, ex);
		}
	}

	/** Categories from highest priority to lowest. */
	public List<Category> categories() {
		return categories;
	}

	/** Roles for cards no main category claimed, named after the community's tag, lowest priority. */
	public List<Category> longTail() {
		return longTail;
	}

	/** Every Scryfall tag the sync has to read, the main categories' first. */
	public java.util.Set<String> allTags() {
		java.util.Set<String> tags = new java.util.LinkedHashSet<>();
		categories.forEach(category -> tags.addAll(category.tags()));
		longTail.forEach(category -> tags.addAll(category.tags()));
		return tags;
	}

	/**
	 * The long tail roles of the cards that none of the main categories claimed. {@code taken} holds the lower-case names that already
	 * have a main category, which are left alone. Each name gets every long tail role it carries, in the order the file lists them.
	 */
	public Map<String, List<String>> assignLongTail(Map<String, List<String>> namesByTag, java.util.Set<String> taken) {
		Map<String, List<String>> result = new LinkedHashMap<>();
		for (Category role : longTail) {
			java.util.Set<String> names = new java.util.LinkedHashSet<>();
			for (String tag : role.tags()) {
				for (String name : namesByTag.getOrDefault(tag, List.of())) {
					String key = name.toLowerCase(java.util.Locale.ROOT);
					if (!taken.contains(key)) {
						names.add(key);
					}
				}
			}
			names.forEach(name -> result.computeIfAbsent(name, key -> new ArrayList<>()).add(role.name()));
		}
		return result;
	}

	/** The role names in priority order, which is also a sensible display order. */
	public List<String> names() {
		return categories.stream().map(Category::name).toList();
	}

	/**
	 * Every category a card belongs to, highest priority first, for each card that carries any of their tags. Keys are lower-case card
	 * names. The first category in a list is the one {@link #assign} would pick.
	 */
	public Map<String, List<String>> assignAll(Map<String, List<String>> namesByTag) {
		Map<String, List<String>> result = new LinkedHashMap<>();
		for (Category category : categories) {
			java.util.Set<String> names = new java.util.LinkedHashSet<>();
			for (String tag : category.tags()) {
				for (String name : namesByTag.getOrDefault(tag, List.of())) {
					names.add(name.toLowerCase(java.util.Locale.ROOT));
				}
			}
			for (String name : names) {
				result.computeIfAbsent(name, key -> new ArrayList<>()).add(category.name());
			}
		}
		return result;
	}

	/** Where a category sits in the priority order: 0 is the highest. A category the file no longer lists sorts last. */
	public int priority(String category) {
		for (int i = 0; i < categories.size(); i++) {
			if (categories.get(i).name().equals(category)) {
				return i;
			}
		}
		for (int i = 0; i < longTail.size(); i++) {
			if (longTail.get(i).name().equals(category)) {
				return categories.size() + i;
			}
		}
		return Integer.MAX_VALUE;
	}

	/**
	 * One category per card. Each category is given the cards that carry any of its tags, highest priority first, and a card
	 * keeps the first category that claims it. Keys of the result are lower-case card names.
	 *
	 * @param namesByTag the cards found for each tag, by the tag's name
	 */
	public Map<String, String> assign(Map<String, List<String>> namesByTag) {
		Map<String, String> result = new LinkedHashMap<>();
		for (Category category : categories) {
			List<String> tags = new ArrayList<>(category.tags());
			for (String tag : tags) {
				for (String name : namesByTag.getOrDefault(tag, List.of())) {
					result.putIfAbsent(name.toLowerCase(java.util.Locale.ROOT), category.name());
				}
			}
		}
		return result;
	}
}
