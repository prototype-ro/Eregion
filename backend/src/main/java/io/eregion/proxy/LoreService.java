package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.common.ApiException;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.Mechanism;
import io.eregion.proxy.LoreDtos.Tier;
import io.eregion.proxy.LoreDtos.Verdict;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Treatment;
import tools.jackson.databind.json.JsonMapper;

/** The Lore Creator: who may touch a deck's lore, what the model is asked, and how a save renders the digest. */
@Service
public class LoreService {

	static final int MAX_DOC_CHARS = 60000;

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final LoreRepository repository;
	private final ProxyRepository proxies;
	private final CardRepository cards;
	private final LorePromptService prompts;

	public LoreService(LoreRepository repository, ProxyRepository proxies, CardRepository cards, LorePromptService prompts) {
		this.repository = repository;
		this.proxies = proxies;
		this.cards = cards;
		this.prompts = prompts;
	}

	public LoreDoc lore(UUID userId, UUID deckId) {
		owned(deckId, userId);
		return repository.loreDoc(deckId);
	}

	/** Saves the document and renders the digest the proxy prompt reads, so the two never drift. */
	public LoreDoc save(UUID userId, UUID deckId, LoreDoc doc) {
		owned(deckId, userId);
		String json = JSON.writeValueAsString(doc);
		if (json.length() > MAX_DOC_CHARS) {
			throw ApiException.badRequest("The lore is too large.");
		}
		repository.saveLoreDoc(deckId, json, renderDigest(doc));
		return doc;
	}

	public LoreDoc draft(UUID userId, UUID deckId, String instruction) {
		owned(deckId, userId);
		return prompts.draft(renderDigest(repository.loreDoc(deckId)), instruction);
	}

	public Verdict check(UUID userId, UUID deckId, UUID cardId) {
		owned(deckId, userId);
		Card card = cards.findById(cardId).orElseThrow(() -> ApiException.notFound("Card"));
		Draft current = proxies.treatment(deckId, cardId).map(LoreService::draftOf).orElse(null);
		return prompts.check(renderDigest(repository.loreDoc(deckId)), facts(card), current);
	}

	/** The text digest of the structured document, read by the proxy prompt. */
	static String renderDigest(LoreDoc doc) {
		var out = new StringBuilder();

		if (doc.cosmology() != null) {
			String maker = blank(doc.cosmology().maker());
			List<String> spirits = doc.cosmology().spirits() == null ? List.of() : doc.cosmology().spirits();
			String corruptor = blank(doc.cosmology().corruptor());
			if (!maker.isEmpty() || !spirits.isEmpty() || !corruptor.isEmpty()) {
				out.append("# Cosmology\n");
				if (!maker.isEmpty()) {
					out.append("Maker: ").append(maker).append('\n');
				}
				if (!spirits.isEmpty()) {
					out.append("Spirits: ").append(String.join(", ", spirits)).append('\n');
				}
				if (!corruptor.isEmpty()) {
					out.append("Corruptor: ").append(corruptor).append('\n');
				}
				out.append('\n');
			}
		}

		if (doc.tiers() != null && !doc.tiers().isEmpty()) {
			out.append("# Spectrum (ordered, un-fallen to most-lost)\n");
			int i = 1;
			for (Tier tier : doc.tiers()) {
				out.append(i++).append(". ").append(blank(tier.name())).append(" (")
						.append(tier.mechanism() == Mechanism.ERASURE ? "erasure" : "addition").append(')');
				if (!blank(tier.definition()).isEmpty()) {
					out.append(" — ").append(blank(tier.definition()));
				}
				if (!blank(tier.vocabulary()).isEmpty()) {
					out.append(" Visual: ").append(blank(tier.vocabulary()));
				}
				out.append('\n');
			}
			out.append('\n');
		}

		if (doc.colors() != null && !doc.colors().isEmpty()) {
			out.append("# Signature colours\n");
			for (var color : doc.colors()) {
				out.append("- ").append(blank(color.color()));
				if (!blank(color.faction()).isEmpty()) {
					out.append(" = ").append(blank(color.faction()));
				}
				if (!blank(color.meaning()).isEmpty()) {
					out.append(": ").append(blank(color.meaning()));
				}
				out.append('\n');
			}
			out.append('\n');
		}

		if (doc.characters() != null && !doc.characters().isEmpty()) {
			out.append("# Named characters\n");
			for (var character : doc.characters()) {
				out.append("- ").append(blank(character.name()));
				appendField(out, character.tier());
				appendField(out, character.race());
				appendField(out, character.role());
				appendField(out, character.signature());
				out.append('\n');
			}
			out.append('\n');
		}

		if (!blank(doc.naming()).isEmpty()) {
			out.append("# Naming conventions\n").append(blank(doc.naming())).append("\n\n");
		}

		if (doc.gaps() != null && !doc.gaps().isEmpty()) {
			out.append("# Open gaps\n");
			for (String gap : doc.gaps()) {
				if (!blank(gap).isEmpty()) {
					out.append("- ").append(blank(gap)).append('\n');
				}
			}
		}

		return out.toString().strip();
	}

	private static void appendField(StringBuilder out, String value) {
		if (!blank(value).isEmpty()) {
			out.append(" — ").append(blank(value));
		}
	}

	private static Draft draftOf(Treatment treatment) {
		Generation g = treatment.current();
		return g == null ? null : new Draft(g.nickname(), g.character(), g.prompt());
	}

	private static CardFacts facts(Card card) {
		return new CardFacts(card.name(), card.manaCost(), card.typeLine(), card.colors(), card.oracleText());
	}

	private static String blank(String value) {
		return value == null ? "" : value.strip();
	}

	private void owned(UUID deckId, UUID userId) {
		if (!repository.ownsDeck(deckId, userId)) {
			throw ApiException.notFound("Deck");
		}
	}
}
