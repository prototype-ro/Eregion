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
import io.eregion.proxy.LoreDtos.Group;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.NamedCharacter;
import io.eregion.proxy.LoreDtos.Problem;
import io.eregion.proxy.LoreDtos.SignatureColor;
import io.eregion.proxy.LoreDtos.TurnMessage;
import io.eregion.proxy.LoreDtos.TurnReply;
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

	/** Refines one part of the working lore in place, keeping the rest exactly as given. */
	public LoreDoc refine(String loreDigest, String target, String instruction) {
		String user = "# Current lore\n\n" + digest(loreDigest) + "\n\n"
				+ "# Part to refine\n\n" + target.strip() + "\n\n"
				+ "# Instruction\n\n" + instruction.strip()
				+ "\n\nReturn the whole document as one JSON object in the documented shape, changing only the requested part and keeping everything else exactly as written.";
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

	/**
	 * One turn of the conversation: the current lore, the bounded history and the player's new message. The model
	 * may draft the whole thing (when the document is still empty) or change just what was asked; either way it
	 * returns the whole document plus a one- or two-sentence summary of what it did.
	 */
	public TurnReply turn(String loreDigest, List<TurnMessage> history, String message) {
		var user = new StringBuilder();
		user.append("# Current lore\n\n").append(digest(loreDigest)).append("\n\n");
		if (history != null && !history.isEmpty()) {
			user.append("# Conversation so far\n\n");
			for (TurnMessage m : history) {
				user.append("assistant".equalsIgnoreCase(m.role()) ? "AI: " : "Player: ").append(orEmpty(m.text()).strip()).append('\n');
			}
			user.append('\n');
		}
		user.append("# New message\n\n").append(message.strip()).append("\n\n")
				.append("Make only the change this message asks for — if the current lore is \"(none yet)\", draft a whole setting per the message instead — ")
				.append("keep everything else exactly as written, and reply with one JSON object: ")
				.append("{\"reply\": a one or two sentence summary of what you changed, \"doc\": the whole document in the documented shape}.");
		return retry(() -> parseTurn(llm.complete(rules, user.toString())));
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
		return docFrom(read(reply));
	}

	static TurnReply parseTurn(String reply) {
		JsonNode root = read(reply);
		if (!root.has("doc")) {
			throw new BadReply("missing doc");
		}
		return new TurnReply(text(root.path("reply")), docFrom(root.path("doc")));
	}

	private static LoreDoc docFrom(JsonNode root) {
		JsonNode cos = root.path("cosmology");
		String overview = text(cos.path("overview"));
		List<String> forces = strings(cos.path("forces"));

		List<Group> groups = new ArrayList<>();
		for (JsonNode g : root.path("groups")) {
			String name = text(g.path("name"));
			if (name.isEmpty()) {
				continue;
			}
			groups.add(new Group(UUID.randomUUID().toString(), name, text(g.path("description")), text(g.path("traits"))));
		}

		List<String> tales = strings(root.path("tales"));

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
			characters.add(new NamedCharacter(UUID.randomUUID().toString(), name, text(ch.path("group")), text(ch.path("race")),
					text(ch.path("role")), text(ch.path("signature"))));
		}

		String canonSource = text(root.path("canonSource"));
		return new LoreDoc(new Cosmology(overview, forces), groups, tales, colors, characters, text(root.path("naming")),
				strings(root.path("gaps")), canonSource.isEmpty() ? null : canonSource);
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
