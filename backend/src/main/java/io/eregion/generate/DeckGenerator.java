package io.eregion.generate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.card.CardResolveService;
import io.eregion.card.ScryfallCard;
import io.eregion.card.ScryfallClient;
import io.eregion.card.ScryfallMapper;
import io.eregion.collection.CollectionRepository;
import io.eregion.common.ApiException;
import io.eregion.deck.DeckDtos.CreateDeckRequest;
import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckDtos.DeckDetail;
import io.eregion.deck.DeckService;
import io.eregion.generate.DeckPlanner.Plan;
import io.eregion.generate.DeckPlanner.Pool;

/**
 * Drafts a Commander deck for a chosen commander. It follows the usual Commander template, 36 lands
 * and about 63 spells, and fills each job with the most played cards that fit the commander's colors,
 * ranked by Scryfall's EDHREC popularity.
 */
@Service
public class DeckGenerator {

	public record Request(UUID commanderId, List<String> playstyles, Integer maxPriceUsd, boolean ownedOnly, String name) {
	}

	public record Result(DeckDetail deck, List<String> notes) {
	}

	private static final Logger log = LoggerFactory.getLogger(DeckGenerator.class);

	static final int DECK_SIZE = 99;
	static final int LAND_TARGET = 36;
	static final int NON_LAND_TARGET = DECK_SIZE - LAND_TARGET;
	private static final int RAMP = 10;
	private static final int DRAW = 9;
	private static final int REMOVAL = 8;
	private static final int WIPES = 3;
	private static final int THEME_SLOTS = NON_LAND_TARGET - RAMP - DRAW - REMOVAL - WIPES;
	private static final int PER_QUERY = 100;
	private static final int MAX_NON_BASIC_LANDS = 10;
	private static final Map<Character, String> BASICS = Map.of('W', "Plains", 'U', "Island", 'B', "Swamp", 'R', "Mountain", 'G', "Forest");

	private final CardRepository cards;
	private final ScryfallClient scryfall;
	private final CollectionRepository collection;
	private final CardResolveService resolver;
	private final DeckService decks;

	public DeckGenerator(CardRepository cards, ScryfallClient scryfall, CollectionRepository collection,
			CardResolveService resolver, DeckService decks) {
		this.cards = cards;
		this.scryfall = scryfall;
		this.collection = collection;
		this.resolver = resolver;
		this.decks = decks;
	}

	public Result generate(UUID userId, Request request) {
		Card commander = cards.findById(request.commanderId()).orElseThrow(() -> ApiException.notFound("Commander"));
		if (!canLead(commander)) {
			throw ApiException.badRequest(commander.name() + " cannot be a commander. Pick a legendary creature.");
		}
		List<Playstyle> styles = styles(request.playstyles());

		try {
			return build(userId, commander, styles, request);
		}
		catch (ApiException ex) {
			throw ex;
		}
		catch (RuntimeException ex) {
			log.warn("Deck generation failed for {}", commander.name(), ex);
			throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not reach Scryfall to build the deck. Try again in a minute.");
		}
	}

	private Result build(UUID userId, Card commander, List<Playstyle> styles, Request request) {
		String identity = commander.colorIdentity();
		String base = "f:commander game:paper id<=" + (identity.isEmpty() ? "c" : identity.toLowerCase(Locale.ROOT))
				+ (request.maxPriceUsd() == null ? "" : " usd<=" + request.maxPriceUsd());

		// What the user owns, by lowercase name. Used to restrict the draft when asked.
		Map<String, Card> owned = new HashMap<>();
		collection.list(userId).forEach(entry -> owned.put(entry.card().name().toLowerCase(Locale.ROOT), entry.card()));

		Map<String, ScryfallCard> found = new LinkedHashMap<>();
		List<Pool> pools = new ArrayList<>();
		pools.add(pool(base, "Ramp", RAMP, "otag:ramp -otag:removal -otag:ritual -t:land", found));
		pools.add(pool(base, "Card draw", DRAW, "otag:draw -t:land", found));
		pools.add(pool(base, "Removal", REMOVAL, "otag:removal -otag:board-wipe -t:land", found));
		pools.add(pool(base, "Board wipes", WIPES, "otag:board-wipe -t:land", found));

		// Spread the theme slots over the chosen playstyles, then over each style's themes by weight.
		int perStyle = THEME_SLOTS / styles.size();
		int leftover = THEME_SLOTS - perStyle * styles.size();
		for (int i = 0; i < styles.size(); i++) {
			Playstyle style = styles.get(i);
			int slots = perStyle + (i == 0 ? leftover : 0);
			DeckPlanner.allocate(style.themes(), slots).forEach((theme, share) -> {
				if (share > 0) {
					pools.add(pool(base, theme.tag(), share, theme.query() + " -t:land", found));
				}
			});
		}

		List<String> filler = names(scryfall.ranked(base + " -t:land", PER_QUERY), found);
		if (request.ownedOnly()) {
			// Cards from the user's collection that fit the colors, used when the popular lists run dry.
			owned.values().stream()
					.filter(card -> !"Land".equals(card.primaryType()) && fitsIdentity(card, identity))
					.sorted((a, b) -> Double.compare(b.priceUsd() == null ? 0 : b.priceUsd(), a.priceUsd() == null ? 0 : a.priceUsd()))
					.forEach(card -> filler.add(card.name()));
		}

		Plan plan = DeckPlanner.plan(pools, filler, NON_LAND_TARGET,
				name -> !request.ownedOnly() || owned.containsKey(name.toLowerCase(Locale.ROOT)), Set.of(commander.name()));

		List<DeckCardInput> inputs = new ArrayList<>();
		inputs.add(new DeckCardInput(commander.id(), 1, "commander", null, List.of()));

		List<Map<Character, Integer>> spellPips = new ArrayList<>();
		for (DeckPlanner.Pick pick : plan.picks()) {
			Card card = resolve(pick.name(), found, owned);
			spellPips.add(Mana.pips(card.manaCost()));
			inputs.add(new DeckCardInput(card.id(), 1, "main", null, List.of(pick.tag())));
		}

		List<String> notes = new ArrayList<>(plan.notes());
		addLands(inputs, base, identity, spellPips, request.ownedOnly(), owned, found, notes);

		String name = request.name() == null || request.name().isBlank() ? commander.name() + " (guided)" : request.name().trim();
		String note = "Guided draft: " + String.join(" and ", styles.stream().map(Playstyle::label).toList());
		DeckDetail deck = decks.create(userId, new CreateDeckRequest(name, "commander", note, inputs));

		int total = inputs.stream().mapToInt(DeckCardInput::quantity).sum();
		if (total < DECK_SIZE + 1) {
			notes.add("The draft has " + total + " of 100 cards.");
		}
		return new Result(deck, List.copyOf(notes));
	}

	private void addLands(List<DeckCardInput> inputs, String base, String identity, List<Map<Character, Integer>> spellPips,
			boolean ownedOnly, Map<String, Card> owned, Map<String, ScryfallCard> found, List<String> notes) {
		List<ScryfallCard> candidates = scryfall.ranked(base + " t:land -t:basic", 60);
		candidates.forEach(card -> found.putIfAbsent(key(card.name()), card));

		int picked = 0;
		for (ScryfallCard land : candidates) {
			if (picked >= MAX_NON_BASIC_LANDS) {
				break;
			}
			if (ownedOnly && !owned.containsKey(key(land.name()))) {
				continue;
			}
			Card card = cards.upsert(ScryfallMapper.toCard(land));
			inputs.add(new DeckCardInput(card.id(), 1, "main", null, List.of("Mana base")));
			picked++;
		}

		// Basic lands fill the rest of the mana base, split by the colors the spells need.
		int basics = LAND_TARGET - picked;
		Map<Character, Integer> split = identity.isEmpty()
				? Map.of('C', basics)
				: Mana.splitBasics(basics, identity, spellPips);
		List<String> basicNames = split.keySet().stream().map(color -> color == 'C' ? "Wastes" : BASICS.get(color)).toList();
		Map<String, Card> resolved = new HashMap<>();
		resolver.resolve(basicNames).matches().forEach(match -> resolved.put(key(match.requested()), match.card()));

		for (Map.Entry<Character, Integer> entry : split.entrySet()) {
			String basicName = entry.getKey() == 'C' ? "Wastes" : BASICS.get(entry.getKey());
			Card card = resolved.get(key(basicName));
			if (card == null || entry.getValue() <= 0) {
				continue;
			}
			inputs.add(new DeckCardInput(card.id(), entry.getValue(), "main", null, List.of("Mana base")));
		}
		if (ownedOnly && picked < 3) {
			notes.add("You own few non-basic lands that fit, so the mana base is mostly basics.");
		}
	}

	private Pool pool(String base, String tag, int target, String query, Map<String, ScryfallCard> found) {
		return new Pool(tag, target, names(scryfall.ranked(base + " " + query, PER_QUERY), found));
	}

	/** Remembers each card by name so it can be saved to the catalog if it gets picked. */
	private static List<String> names(List<ScryfallCard> results, Map<String, ScryfallCard> found) {
		List<String> names = new ArrayList<>(results.size());
		for (ScryfallCard card : results) {
			found.putIfAbsent(key(card.name()), card);
			names.add(card.name());
		}
		return names;
	}

	private Card resolve(String name, Map<String, ScryfallCard> found, Map<String, Card> owned) {
		ScryfallCard source = found.get(key(name));
		if (source != null) {
			return cards.upsert(ScryfallMapper.toCard(source));
		}
		return owned.get(key(name));
	}

	private static List<Playstyle> styles(List<String> ids) {
		if (ids == null || ids.isEmpty()) {
			return List.of(Playstyle.byId("goodstuff").orElseThrow());
		}
		List<Playstyle> styles = new ArrayList<>();
		for (String id : ids.stream().distinct().limit(2).toList()) {
			styles.add(Playstyle.byId(id).orElseThrow(() -> ApiException.badRequest("Unknown playstyle '" + id + "'")));
		}
		return styles;
	}

	/** A hint at whether a card can lead a deck. Scryfall's own legality filter decides the rest. */
	static boolean canLead(Card card) {
		return card.typeLine().contains("Legendary")
				&& (card.typeLine().contains("Creature") || card.oracleText().contains("can be your commander"));
	}

	/** True when every color of the card is among the commander's colors. */
	static boolean fitsIdentity(Card card, String identity) {
		for (char color : card.colorIdentity().toCharArray()) {
			if (identity.indexOf(color) < 0) {
				return false;
			}
		}
		return true;
	}

	private static String key(String name) {
		return name.toLowerCase(Locale.ROOT);
	}
}
