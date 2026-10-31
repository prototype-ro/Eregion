package io.eregion.proxy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.common.ApiException;
import io.eregion.proxy.LoreDtos.Cosmology;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.Mechanism;
import io.eregion.proxy.LoreDtos.NamedCharacter;
import io.eregion.proxy.LoreDtos.Problem;
import io.eregion.proxy.LoreDtos.SignatureColor;
import io.eregion.proxy.LoreDtos.Tier;
import io.eregion.proxy.LoreDtos.Verdict;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Draft;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Turns the deck's lore into a Lore Creator request, and the model's JSON answer into a doc or a verdict. */
@Service
public class LorePromptService {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The reply was not the JSON we asked for. */
	static class BadReply extends RuntimeException {
		BadReply(String message) {
			super(message);
		}
	}

	private final LlmClient llm;
	private final String rules;

	public LorePromptService(LlmClient llm) {
		this.llm = llm;
		try (var in = LorePromptService.class.getResourceAsStream("/lore-rules.md")) {
			this.rules = new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	/** Drafts a whole setting from the current lore and the instruction, with fresh ids on every item. */
	public LoreDoc draft(String loreDigest, String instruction) {
		String user = "# Current lore\n\n" + digest(loreDigest) + "\n\n# What to draft\n\n" + instruction.strip()
				+ "\n\nDraft the whole setting as one JSON object in the documented shape.";
		return retry(() -> parseDoc(llm.complete(rules, user)));
	}

	/** Checks one card (and its current treatment, when it has one) against the locked lore. */
	public Verdict check(String loreDigest, CardFacts card, Draft current) {
		var user = new StringBuilder();
		user.append("# Locked lore\n\n").append(digest(loreDigest)).append("\n\n");
		user.append("# Card\n\n");
		user.append("Name: ").append(card.name()).append('\n');
		user.append("Type: ").append(orEmpty(card.typeLine())).append('\n');
		user.append("Colors: ").append(orEmpty(card.colors())).append('\n');
		user.append("Rules text: ").append(orEmpty(card.oracleText())).append('\n');
		if (current != null) {
			user.append("\n# Its current treatment\n\n");
			if (current.nickname() != null) {
				user.append("Nickname: ").append(current.nickname()).append('\n');
			}
			user.append("Tier: ").append(orEmpty(current.character().tier())).append('\n');
			user.append("Who: ").append(orEmpty(current.character().who())).append('\n');
			user.append("Race: ").append(orEmpty(current.character().race())).append('\n');
			user.append("Role: ").append(orEmpty(current.character().role())).append('\n');
			user.append("Prompt: ").append(orEmpty(current.prompt())).append('\n');
		}
		user.append("\nCheck this card against the locked lore and return {\"fits\": ..., \"problems\": [...]}.");
		return retry(() -> parseVerdict(llm.complete(rules, user.toString())));
	}

	private <T> T retry(java.util.function.Supplier<T> attempt) {
		BadReply last = null;
		for (int i = 0; i < 2; i++) {
			try {
				return attempt.get();
			}
			catch (BadReply ex) {
				last = ex;
			}
		}
		throw ApiException.unavailable("The model's answer could not be read (" + last.getMessage() + "). Try again.");
	}

	static LoreDoc parseDoc(String reply) {
		JsonNode root = read(reply);
		JsonNode cos = root.path("cosmology");
		String maker = text(cos.path("maker"));
		List<String> spirits = strings(cos.path("spirits"));
		String corruptor = text(cos.path("corruptor"));

		List<Tier> tiers = new ArrayList<>();
		for (JsonNode t : root.path("tiers")) {
			String name = text(t.path("name"));
			if (name.isEmpty()) {
				continue;
			}
			tiers.add(new Tier(UUID.randomUUID().toString(), name, text(t.path("definition")), mechanism(t.path("mechanism")), text(t.path("vocabulary"))));
		}

		List<SignatureColor> colors = new ArrayList<>();
		for (JsonNode c : root.path("colors")) {
			String faction = text(c.path("faction"));
			String color = text(c.path("color"));
			if (faction.isEmpty() && color.isEmpty()) {
				continue;
			}
			colors.add(new SignatureColor(UUID.randomUUID().toString(), faction, color, text(c.path("meaning"))));
		}

		List<NamedCharacter> characters = new ArrayList<>();
		for (JsonNode ch : root.path("characters")) {
			String name = text(ch.path("name"));
			if (name.isEmpty()) {
				continue;
			}
			characters.add(new NamedCharacter(UUID.randomUUID().toString(), name, text(ch.path("tier")), text(ch.path("race")), text(ch.path("role")), text(ch.path("signature"))));
		}

		return new LoreDoc(new Cosmology(maker, spirits, corruptor), tiers, colors, characters, text(root.path("naming")), strings(root.path("gaps")));
	}

	static Verdict parseVerdict(String reply) {
		JsonNode root = read(reply);
		List<Problem> problems = new ArrayList<>();
		for (JsonNode p : root.path("problems")) {
			String message = text(p.path("message"));
			if (!message.isEmpty()) {
				problems.add(new Problem(text(p.path("rule")), message));
			}
		}
		boolean fits = root.has("fits") ? root.path("fits").asBoolean() : problems.isEmpty();
		return new Verdict(fits, problems);
	}

	private static JsonNode read(String reply) {
		try {
			JsonNode root = JSON.readTree(ProxyPromptService.stripFence(reply));
			if (root == null || root.isMissingNode()) {
				throw new BadReply("empty answer");
			}
			return root;
		}
		catch (RuntimeException ex) {
			if (ex instanceof BadReply bad) {
				throw bad;
			}
			throw new BadReply("not JSON");
		}
	}

	private static Mechanism mechanism(JsonNode node) {
		return "ERASURE".equalsIgnoreCase(node.asString("")) ? Mechanism.ERASURE : Mechanism.ADDITION;
	}

	private static List<String> strings(JsonNode node) {
		List<String> values = new ArrayList<>();
		if (node.isArray()) {
			for (JsonNode item : node) {
				String value = item.asString("").strip();
				if (!value.isEmpty()) {
					values.add(value);
				}
			}
		}
		return values;
	}

	private static String text(JsonNode node) {
		return node == null ? "" : node.asString("").strip();
	}

	private static String digest(String lore) {
		return lore == null || lore.isBlank() ? "(none yet)" : lore.strip();
	}

	private static String orEmpty(String value) {
		return value == null ? "" : value;
	}
}
