package io.eregion.proxy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.stereotype.Service;

import io.eregion.common.ApiException;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Character;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Turns a deck's lore and one card into a request for the model, and the model's JSON answer into a {@link Draft}. */
@Service
public class ProxyPromptService {

	static final int MAX_PROMPT = 4000;
	static final int MAX_NICKNAME = 80;
	static final int MAX_FIELD = 400;
	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The reply was not the JSON we asked for. One retry, then the card fails. */
	static class BadReply extends RuntimeException {
		BadReply(String message) {
			super(message);
		}
	}

	private final LlmClient llm;
	private final String rules;

	public ProxyPromptService(LlmClient llm) {
		this.llm = llm;
		try (var in = ProxyPromptService.class.getResourceAsStream("/proxy-rules.md")) {
			this.rules = new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	/**
	 * @param previous the current result when refining, otherwise null
	 * @param instruction what to change when refining, otherwise null
	 * @param ignoreType when true, the card's own printed type/subtype is not binding — the lore decides what this subject actually is
	 * @param ignoreRulesText when true, the card's own rules text is not binding — the subject comes from the lore and the type alone
	 */
	public Draft generate(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText) {
		String user = userMessage(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText);
		BadReply last = null;
		for (int attempt = 0; attempt < 2; attempt++) {
			String reply = llm.complete(rules, user);
			try {
				return parse(reply, mode);
			}
			catch (BadReply ex) {
				last = ex;
			}
		}
		throw ApiException.unavailable("The model's answer could not be read (" + last.getMessage() + "). Try again.");
	}

	static String userMessage(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText) {
		var out = new StringBuilder();
		out.append("# Deck lore\n\n").append(lore == null || lore.isBlank() ? "(none given: keep the result generic)" : lore.strip()).append("\n\n");
		out.append("# Mode\n\n").append(mode).append(mode == Mode.RESKIN ? " (keep the card's own name)" : " (invent a new name)").append("\n\n");
		out.append("# Card\n\n");
		out.append("Name: ").append(card.name()).append('\n');
		out.append("Mana cost: ").append(nullToEmpty(card.manaCost())).append('\n');
		out.append("Type: ").append(nullToEmpty(card.typeLine())).append('\n');
		if (ignoreType) {
			out.append("(Ignore this card's own printed type/subtype above — it is not binding. Let the deck lore decide entirely what this ")
					.append("subject actually is — character, object, place or effect — even where that contradicts the printed type.)\n");
		}
		out.append("Colors: ").append(nullToEmpty(card.colors())).append('\n');
		out.append("Rules text: ").append(nullToEmpty(card.oracleText())).append('\n');
		if (ignoreRulesText) {
			out.append("(Ignore this card's own rules text above as an anchor for the subject — do not let it steer who or what this is. ")
					.append("Decide entirely from the deck lore and the card's type instead.)\n");
		}
		out.append('\n');
		if (!others.isEmpty()) {
			out.append("# Already chosen for other cards in this deck (do not reuse these names)\n\n");
			for (Pick pick : others) {
				out.append("- ").append(pick.cardName()).append(": ");
				out.append(pick.nickname() == null ? "(kept its name)" : pick.nickname());
				out.append(", ").append(pick.tier() == null || pick.tier().isBlank() ? "no tier" : pick.tier()).append('\n');
			}
			out.append('\n');
		}
		if (previous != null && instruction != null && !instruction.isBlank()) {
			out.append("# Previous result to refine\n\n");
			if (previous.nickname() != null) {
				out.append("Nickname: ").append(previous.nickname()).append('\n');
			}
			out.append("Prompt: ").append(previous.prompt()).append("\n\n");
			out.append("# Change requested\n\n").append(instruction.strip()).append('\n');
		}
		return out.toString();
	}

	static Draft parse(String reply, Mode mode) {
		JsonNode root;
		try {
			root = JSON.readTree(stripFence(reply));
		}
		catch (RuntimeException ex) {
			throw new BadReply("not JSON");
		}
		JsonNode character = root.path("character");
		String prompt = root.path("prompt").asString("").strip();
		String who = character.path("who").asString("").strip();
		if (prompt.isEmpty() || prompt.length() > MAX_PROMPT) {
			throw new BadReply("no usable prompt");
		}
		if (who.isEmpty()) {
			throw new BadReply("no character");
		}
		String nickname = null;
		if (mode == Mode.NICKNAME) {
			nickname = root.path("nickname").asString("").strip();
			if (nickname.isEmpty() || nickname.length() > MAX_NICKNAME) {
				throw new BadReply("no usable nickname");
			}
		}
		String tier = character.path("tier").asString("").strip();
		String race = character.path("race").asString("").strip();
		String role = character.path("role").asString("").strip();
		String signature = character.path("signature").asString("").strip();
		for (String field : new String[] { tier, who, race, role, signature }) {
			if (field.length() > MAX_FIELD) {
				throw new BadReply("a field is too long");
			}
		}
		return new Draft(nickname, new Character(tier, who, race, role, signature), withAspect(prompt));
	}

	/** Every card is printed 5:7, so a reply that forgot the ratio gets it here instead of depending on the model. */
	static String withAspect(String prompt) {
		// A comma or semicolon left in front of a parameter is the model's habit, and Midjourney reads it as part of the text.
		String tidy = prompt.replaceAll("[,;]\\s*(?=--)", " ").replaceAll("\\s{2,}", " ");
		return tidy.contains("--ar ") ? tidy : tidy + " --ar 5:7";
	}

	/** Models sometimes wrap JSON in a code fence even when told not to. */
	static String stripFence(String reply) {
		String text = reply == null ? "" : reply.strip();
		if (text.startsWith("```")) {
			int firstBreak = text.indexOf('\n');
			int close = text.lastIndexOf("```");
			if (firstBreak > 0 && close > firstBreak) {
				text = text.substring(firstBreak + 1, close).strip();
			}
		}
		return text;
	}

	private static String nullToEmpty(String value) {
		return value == null ? "" : value;
	}
}
