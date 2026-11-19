package io.eregion.proxy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

	private static final Logger log = LoggerFactory.getLogger(ProxyPromptService.class);

	static final int ATTEMPTS = 3;
	static final int MAX_PROMPT = 4000;
	static final int MAX_NICKNAME = 80;
	static final int MAX_FIELD = 400;
	private static final JsonMapper JSON = JsonMapper.builder().build();
	/** Words of a printed name that say nothing about it, so a nickname may share them. */
	private static final Set<String> FILLER = Set.of("the", "of", "and", "for", "with", "from", "into", "upon", "that", "this");

	/** The reply was not the JSON we asked for. One retry, then the card fails. */
	static class BadReply extends RuntimeException {
		BadReply(String message) {
			super(message);
		}
	}

	/** One real-printed-card reference prompt, used as a structural anchor — never copied onto the new card. */
	record ArchiveEntry(String name, String register, String subtype, String style, String prompt) {
	}

	private static final Pattern ARCHIVE_LINE = Pattern
			.compile("^-\\s+\\*\\*(.+?)\\*\\*\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+)$");

	/** Subtype keyword -> regex over the oracle text that signals it. Checked in order; the first match wins. */
	private static final List<java.util.Map.Entry<String, Pattern>> SUBTYPE_SIGNALS = List.of(
			java.util.Map.entry("Removal", Pattern.compile("(?i)\\b(destroy|exile)\\b")),
			java.util.Map.entry("Counter", Pattern.compile("(?i)\\bcounter target\\b")),
			java.util.Map.entry("Combat trick", Pattern.compile("(?i)\\bgets?\\s+[+\\-]\\d+/[+\\-]\\d+\\b")),
			java.util.Map.entry("Damage prevention", Pattern.compile("(?i)\\bprevent\\b")),
			java.util.Map.entry("Tempo", Pattern.compile("(?i)\\breturn target\\b")),
			java.util.Map.entry("Card selection", Pattern.compile("(?i)\\bdraw\\s+\\w*\\s*cards?\\b")));

	private final LlmClient llm;
	private final String rules;
	private final List<ArchiveEntry> instantArchive;

	public ProxyPromptService(LlmClient llm) {
		this.llm = llm;
		try (var in = ProxyPromptService.class.getResourceAsStream("/proxy-rules.md")) {
			this.rules = new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
		this.instantArchive = loadArchive("/instant-reference-prompts.md");
	}

	/** Parses the `- **Name** | Register | Subtype | style | prompt` lines of a reference-prompt archive file. Missing file -> empty list. */
	static List<ArchiveEntry> loadArchive(String resource) {
		List<ArchiveEntry> entries = new ArrayList<>();
		try (var in = ProxyPromptService.class.getResourceAsStream(resource)) {
			if (in == null) {
				return entries;
			}
			for (String line : new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\n")) {
				var m = ARCHIVE_LINE.matcher(line.strip());
				if (m.matches()) {
					entries.add(new ArchiveEntry(m.group(1).strip(), m.group(2).strip(), m.group(3).strip(), m.group(4).strip(), m.group(5).strip()));
				}
			}
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
		return entries;
	}

	/** The card's subtype guessed from its oracle text (same rough categories the archive is tagged with), or null when nothing matched. */
	static String subtypeOf(CardFacts card) {
		String text = nullToEmpty(card.oracleText());
		for (var signal : SUBTYPE_SIGNALS) {
			if (signal.getValue().matcher(text).find()) {
				return signal.getKey();
			}
		}
		return null;
	}

	/**
	 * Up to 3 real-art anchors for this card: entries whose Subtype field contains the guessed subtype, falling back to the Collision register
	 * when nothing matches so there's always at least a structural example. Only called for Instant cards with their rules text visible to the
	 * model — without real oracle text there's nothing to classify a subtype from.
	 */
	List<ArchiveEntry> anchorsFor(CardFacts card) {
		if (instantArchive.isEmpty() || nullToEmpty(card.typeLine()).toLowerCase(Locale.ROOT).indexOf("instant") < 0) {
			return List.of();
		}
		String subtype = subtypeOf(card);
		List<ArchiveEntry> matched = subtype == null ? List.of()
				: instantArchive.stream().filter(e -> e.subtype().toLowerCase(Locale.ROOT).contains(subtype.toLowerCase(Locale.ROOT))).limit(3).toList();
		if (!matched.isEmpty()) {
			return matched;
		}
		return instantArchive.stream().filter(e -> "Collision".equalsIgnoreCase(e.register())).limit(2).toList();
	}

	static boolean isInstantOrSorcery(CardFacts card) {
		String type = nullToEmpty(card.typeLine()).toLowerCase(Locale.ROOT);
		return type.contains("instant") || type.contains("sorcery");
	}

	/**
	 * A free-form (not JSON-constrained) call that lets the model actually deliberate — pick a register, sketch three
	 * divergent concepts, commit to one — before the JSON-locked generation call has to decide anything. A
	 * non-reasoning model forced straight into {@code response_format: json_object} has no room to think this
	 * through; this gives it one. Returns null (and logs a warning) rather than failing the whole generation if the
	 * brainstorming call itself errors — the final call still works without it, just with less deliberation behind it.
	 */
	String tryBrainstorm(String lore, CardFacts card, Mode mode, List<Pick> others, String tier, List<ArchiveEntry> anchors) {
		try {
			String ask = userMessage(lore, card, mode, others, null, null, false, false, false, tier, anchors) + brainstormTask();
			return llm.chat(rules, List.of(new LlmClient.Turn("user", ask))).strip();
		}
		catch (RuntimeException ex) {
			log.warn("Brainstorm pass failed, generating without it: {}", ex.toString());
			return null;
		}
	}

	static String brainstormTask() {
		return "\n# Task — brainstorm only, do not write JSON yet\n\n"
				+ "Do not answer with JSON in this reply. In plain prose, under 260 words: name which of the six instant/sorcery "
				+ "registers from \"# What to draw, by card type\" fits this specific card and why in one sentence. "
				+ "If real-art reference anchors were given above, starting from one is mandatory, not optional: quote or closely "
				+ "paraphrase the closest anchor's actual clause structure, then show the transformation clause by clause — what "
				+ "each clause's content word becomes for this card, keeping the same clause order, same rough density, same level "
				+ "of physical specificity, same approximate length. Do not invent a scene from a blank page that merely resembles "
				+ "the anchor in your memory of it; the anchor's text is the literal starting draft you edit. "
				+ "Then write two more variations of that SAME transformation, each changing one further clause (the setting's "
				+ "landmark in one, the signature detail in the other) — three variations sharing one visible skeleton, not three "
				+ "unrelated fresh ideas. If no anchors were given, sketch three divergent one-line concepts from scratch instead. "
				+ "Before picking one of the three: name each variation's object category and its setting's landmark in one short "
				+ "clause each, then check both against every `signature` already listed under \"# Already chosen for other cards "
				+ "in this deck\" (including a lore landmark or sigil another card already centered its signature on) and cross out "
				+ "any variation that repeats a category, device or landmark already used there — a lore prop named once in the deck "
				+ "lore is not exempt from this just because the lore names it. Pick the strongest survivor and say in one sentence "
				+ "why the other two lost (repetition, or the other usual reasons); name the one cliché from \"# An interruption, "
				+ "not a trope\" this card is most tempted toward and confirm the pick avoids it. This is the only place that "
				+ "deliberation happens — the next message asks for the final JSON built directly from what you commit to here.\n";
	}

	/**
	 * @param previous the current result when refining, otherwise null
	 * @param instruction what to change when refining, otherwise null
	 * @param ignoreType when true, the card's own printed type/subtype is not binding — the lore decides what this subject actually is
	 * @param ignoreRulesText when true, the card's own rules text is not binding — the subject comes from the lore and the type alone
	 */
	public Draft generate(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText) {
		return generate(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText, false);
	}

	/** @param loreOnly when true the model is sent nothing of the card but its type (creature type for a creature, card type otherwise), so the deck lore alone shapes the result */
	public Draft generate(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText, boolean loreOnly) {
		return generate(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText, loreOnly, null);
	}

	/** @param tier the lore group the card must be placed in, or null or blank to let the model choose */
	public Draft generate(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText, boolean loreOnly, String tier) {
		List<ArchiveEntry> anchors = (ignoreRulesText || loreOnly) ? List.of() : anchorsFor(card);
		if (isInstantOrSorcery(card)) {
			log.info("[diag] card={} subtype={} anchors={}", card.name(), subtypeOf(card),
					anchors.stream().map(a -> a.name() + " (" + a.register() + ")").toList());
		}
		String user = userMessage(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText, loreOnly, tier, anchors);
		if (!ignoreRulesText && !loreOnly && isInstantOrSorcery(card)) {
			String concept = tryBrainstorm(lore, card, mode, others, tier, anchors);
			if (concept != null) {
				log.info("[diag] card={} brainstorm={}", card.name(), concept);
				user += "\n# Committed concept (from a separate brainstorming pass, before this JSON is written)\n\n" + concept
						+ "\n\nBuild the final prompt from this committed concept — do not reopen the register or concept choice, only turn it into the final compact Midjourney prompt and the JSON fields.\n";
			}
		}
		BadReply last = null;
		for (int attempt = 0; attempt < ATTEMPTS; attempt++) {
			// A rejected answer is sent back with the reason, so the retry fixes that and not something else.
			String ask = last == null ? user : user + "\n# Your previous answer was rejected\n\n" + last.getMessage() + ". Answer again and fix exactly that.\n";
			String reply = llm.complete(rules, ask);
			try {
				Draft draft = parse(reply, mode);
				String problem = problemWith(card, mode, draft, loreTermsOf(reply), lore, tier);
				if (problem != null) {
					throw new BadReply(problem);
				}
				if (isInstantOrSorcery(card)) {
					log.info("[diag] card={} attempt={} final signature={} prompt={}", card.name(), attempt, draft.character().signature(), draft.prompt());
				}
				return draft;
			}
			catch (BadReply ex) {
				last = ex;
			}
		}
		throw ApiException.unavailable("The model's answer could not be read (" + last.getMessage() + "). Try again.");
	}

	static String userMessage(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText) {
		return userMessage(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText, false);
	}

	static String userMessage(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText, boolean loreOnly) {
		return userMessage(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText, loreOnly, null);
	}

	static String userMessage(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText, boolean loreOnly, String tier) {
		return userMessage(lore, card, mode, others, previous, instruction, ignoreType, ignoreRulesText, loreOnly, tier, List.of());
	}

	static String userMessage(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction, boolean ignoreType,
			boolean ignoreRulesText, boolean loreOnly, String tier, List<ArchiveEntry> anchors) {
		var out = new StringBuilder();
		out.append("# Deck lore\n\n").append(lore == null || lore.isBlank() ? "(none given: keep the result generic)" : lore.strip()).append("\n\n");
		out.append("# Mode\n\n").append(mode).append(mode == Mode.RESKIN ? " (keep the card's own name)" : " (invent a new name)").append("\n\n");
		if (!blank(tier).isEmpty()) {
			out.append("# Required tier\n\n");
			out.append("The player chose the tier \"").append(blank(tier)).append("\" of the deck lore for this card. Place it there, and write exactly \"")
					.append(blank(tier)).append("\" in the tier field. Design it as a subject of that tier, with what the lore says about it; do not choose another tier.\n\n");
		}
		out.append("# Card\n\n");
		out.append(cardSection(card, mode, ignoreType, ignoreRulesText, loreOnly));
		if (!anchors.isEmpty()) {
			out.append("# Real-art reference anchors — build this card's prompt on top of one of these, mandatory\n\n");
			out.append("These are reverse-engineered prompts from real printed Magic art of other cards in the same mechanical family. ")
					.append("Pick the single closest one below and use its structure as the scaffold for this card's prompt: the same number of ")
					.append("distinct visual elements in the same order (subject/collision device, setting, light source, palette, crop), the same ")
					.append("rough word-count density, the same level of physical specificity (texture, a named light source, a grounded place). ")
					.append("Then replace every content word with something specific to this card — the object, the setting and the signature ")
					.append("detail must all be different from the anchor, only the scaffold is shared. A prompt that is thinner, vaguer or more ")
					.append("abstract than its chosen anchor is a failure; a prompt that copies the anchor's actual imagery onto this card is also ")
					.append("a failure. Match the craft, invent the content.\n\n");
			for (ArchiveEntry anchor : anchors) {
				out.append("- ").append(anchor.register()).append(" / ").append(anchor.subtype()).append(": ").append(anchor.prompt()).append('\n');
			}
			out.append('\n');
		}
		if (!others.isEmpty()) {
			out.append("# Already chosen for other cards in this deck (do not reuse these names, and do not repeat a signature visual below)\n\n");
			for (Pick pick : others) {
				out.append("- ").append(pick.cardName()).append(": ");
				out.append(pick.nickname() == null ? "(kept its name)" : pick.nickname());
				out.append(", ").append(pick.tier() == null || pick.tier().isBlank() ? "no tier" : pick.tier());
				out.append(", signature: ").append(pick.signature() == null || pick.signature().isBlank() ? "(none recorded)" : pick.signature());
				out.append('\n');
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

	/**
	 * The card as the model is allowed to see it. What the player turned off is not sent at all (a model told to ignore text it can read still lets it
	 * steer the result), and with {@code loreOnly} nothing of the card is sent but its creature type. Generation and chat both use this, so they never
	 * disagree about what the printed card is allowed to say.
	 */
	static String cardSection(CardFacts card, Mode mode, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly) {
		var out = new StringBuilder();
		if (loreOnly) {
			// the deck lore and the creature type are all the model gets: nothing else of the printed card can steer the result
			out.append(typeOnly(card)).append('\n');
			out.append("(Everything else about the printed card is withheld on purpose. The subject comes from the deck lore and the type above alone: ")
					.append("invent the name and the character from the lore.)\n\n");
		}
		else {
			// What the player turned off is not sent at all: a model told to ignore text it can read still lets it steer the result.
			if (mode == Mode.NICKNAME) {
				out.append("Name: (withheld on purpose: invent a new name from the deck lore; nothing of the printed name, in words or in imagery, may carry over)\n");
			}
			else {
				out.append("Name: ").append(card.name()).append('\n');
			}
			out.append("Mana cost: ").append(nullToEmpty(card.manaCost())).append('\n');
			if (ignoreType) {
				out.append("Type: (withheld on purpose: the printed type is not binding. Let the deck lore decide entirely what this subject actually is, ")
						.append("character, object, place or effect.)\n");
			}
			else {
				out.append("Type: ").append(nullToEmpty(card.typeLine())).append('\n');
			}
			out.append("Colors: ").append(nullToEmpty(card.colors())).append('\n');
			if (ignoreRulesText) {
				out.append("Rules text: (withheld on purpose: the subject comes from the deck lore and the type alone)\n");
			}
			else {
				// the rules text names its own card ("Whenever Ancient Copper Dragon deals..."), which would give the printed name back
				String text = mode == Mode.NICKNAME ? withoutName(card, nullToEmpty(card.oracleText())) : nullToEmpty(card.oracleText());
				out.append("Rules text: ").append(text).append('\n');
			}
			out.append('\n');
		}
		return out.toString();
	}

	/** The system prompt for the advanced chat: the same card and lore context, but discussing instead of drafting JSON. */
	static String chatSystem(String lore, CardFacts card, Mode mode, boolean ignoreType, boolean ignoreRulesText, Draft current) {
		return chatSystem(lore, card, mode, ignoreType, ignoreRulesText, false, current);
	}

	static String chatSystem(String lore, CardFacts card, Mode mode, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly, Draft current) {
		var out = new StringBuilder();
		out.append("You help design the art direction for one Magic: The Gathering proxy card before any change is committed. ")
				.append("Discuss ideas, answer questions, and suggest concrete directions in plain conversational replies — a few sentences, ")
				.append("never a finished Midjourney prompt or JSON. When the player seems settled on a direction, say so plainly and name the ")
				.append("single change they should commit; the actual prompt is only written once they commit that refinement separately.\n\n");
		out.append("# Deck lore\n\n").append(lore == null || lore.isBlank() ? "(none given: keep ideas generic)" : lore.strip()).append("\n\n");
		out.append("# Card\n\n");
		out.append(cardSection(card, mode, ignoreType, ignoreRulesText, loreOnly));
		out.append("Mode: ").append(mode).append(mode == Mode.RESKIN ? " (keeps the card's own name)" : " (invents a new name)").append('\n');
		if (current != null) {
			out.append("\n# Currently committed result\n\n");
			if (current.nickname() != null) {
				out.append("Nickname: ").append(current.nickname()).append('\n');
			}
			out.append("Who: ").append(current.character().who()).append('\n');
			out.append("Prompt: ").append(current.prompt()).append('\n');
		}
		return out.toString();
	}

	/**
	 * All that "lore only" lets the model know of a card: its creature type, or for a card that is not a creature its plain card type. Supertypes such as
	 * Legendary are dropped.
	 */
	static String typeOnly(CardFacts card) {
		String[] parts = nullToEmpty(card.typeLine()).split("\\s[\u2014\u2013-]\\s", 2);
		String main = parts[0].strip();
		String subtypes = parts.length > 1 ? parts[1].strip() : "";
		if (main.contains("Creature")) {
			return "Creature type: " + (subtypes.isEmpty() ? "creature" : subtypes);
		}
		String kind = main.replaceAll("\\b(Legendary|Basic|Snow|World|Tribal|Kindred|Token)\\b", "").replaceAll("\\s{2,}", " ").strip();
		return "Card type: " + (kind.isEmpty() ? main : kind) + (subtypes.isEmpty() ? "" : " (" + subtypes + ")");
	}

	/** The text with the card's printed name (and its front face, for a two-faced card) replaced by "this card". */
	static String withoutName(CardFacts card, String text) {
		String result = text;
		if (card.name() != null && !card.name().isBlank()) {
			result = Pattern.compile(Pattern.quote(card.name()), Pattern.CASE_INSENSITIVE).matcher(result).replaceAll("this card");
			int slash = card.name().indexOf(" // ");
			if (slash > 0) {
				result = Pattern.compile(Pattern.quote(card.name().substring(0, slash)), Pattern.CASE_INSENSITIVE).matcher(result).replaceAll("this card");
			}
		}
		return result;
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

	/**
	 * Why an answer is refused, as a sentence the model can act on, or null when it is fine. Three things are refused: the printed card showing through, a
	 * word the lore invented standing in the prompt (the generator cannot read it), and a rule of the lore restated as a sentence of the prompt.
	 */
	static String problemWith(CardFacts card, Mode mode, Draft draft, List<String> reportedTerms, String lore) {
		return problemWith(card, mode, draft, reportedTerms, lore, null);
	}

	static String problemWith(CardFacts card, Mode mode, Draft draft, List<String> reportedTerms, String lore, String tier) {
		if (!blank(tier).isEmpty()) {
			String given = draft.character() == null ? "" : blank(draft.character().tier());
			if (!given.toLowerCase(Locale.ROOT).contains(blank(tier).toLowerCase(Locale.ROOT))) {
				return "the player chose the tier \"" + blank(tier) + "\" but the tier field says \"" + given + "\": place the card in that tier and write exactly that";
			}
		}
		String echo = echoOfPrintedName(card, mode, draft, lore);
		if (echo != null) {
			return "the nickname or prompt repeats \"" + echo + "\" from the printed card name, and nothing of the printed name may carry over: invent from the lore";
		}
		String body = bodyOf(draft.prompt());
		for (String term : loreTerms(draft, reportedTerms, lore)) {
			if (containsPhrase(body, term)) {
				return "the prompt uses the lore word \"" + term + "\", which the image generator cannot read: describe what it looks like instead";
			}
		}
		String misplaced = humanThingOnABeast(body);
		if (misplaced != null) {
			return "the prompt has a beast with \"" + misplaced + "\": a dragon or beast never reads, writes or studies, and nothing human-made (a brazier, lantern, candle or torch) lights its scene: show what it physically does in a place from the lore";
		}
		String audience = audienceOfBeasts(body);
		if (audience != null) {
			return "the prompt gives a dragon an audience (\"" + audience + "\"): the creature stands alone with at most one reactor, and the lore has no lesser kin to invent";
		}
		int words = body.isBlank() ? 0 : body.strip().split("\\s+").length;
		if (words > MAX_WORDS) {
			return "the prompt is " + words + " words: cut it to about 90, keeping the limb count and the one signature detail";
		}
		String duplicated = restatedProhibition(draft.prompt());
		if (duplicated != null) {
			return "the prompt states \"" + duplicated + "\" as a rule in its sentences: prohibitions belong only in the --no list, and the sentences describe what is seen";
		}
		return null;
	}

	private static final Pattern BEAST = Pattern.compile("(?i)\\b(dragon|wyrm|drake|wyvern)s?\\b");
	private static final Pattern HUMAN_THING = Pattern.compile("(?i)\\b(scrolls?|books?|tomes?|quill|desk|wheelbarrow|reading|reads|writing|writes|studying|braziers?|lanterns?|candles?|torch(?:es)?)\\b");

	private static final int MAX_WORDS = 140;
	private static final Pattern AUDIENCE = Pattern.compile("(?i)\\b(two|three|four|five|six|seven|several|many|a crowd of|rows? of|dozens? of|a dozen)\\s+(smaller|lesser|small|tiny|little|younger|lower)\\b");

	/** A crowd of smaller creatures around a dragon or other beast ("five smaller drakes ... watching"), or null. */
	static String audienceOfBeasts(String body) {
		if (body == null || !BEAST.matcher(body).find()) {
			return null;
		}
		var found = AUDIENCE.matcher(body);
		return found.find() ? found.group() : null;
	}

	/** A human pastime or prop (scrolls, books, a desk, a wheelbarrow) in a prompt that is about a dragon or other beast, or null. */
	static String humanThingOnABeast(String body) {
		if (body == null || !BEAST.matcher(body).find()) {
			return null;
		}
		var found = HUMAN_THING.matcher(body);
		return found.find() ? found.group() : null;
	}

	/** The sentence part of a prompt: everything before the first parameter. */
	static String bodyOf(String prompt) {
		String text = prompt == null ? "" : prompt;
		int parameters = text.indexOf(" --");
		return parameters < 0 ? text : text.substring(0, parameters);
	}

	/** True when {@code text} has {@code phrase} as whole words, ignoring case. */
	private static boolean containsPhrase(String text, String phrase) {
		return Pattern.compile("(?<![\\p{L}])" + Pattern.quote(phrase) + "(?![\\p{L}])", Pattern.CASE_INSENSITIVE).matcher(text).find();
	}

	/** The model's own list of the lore's invented words it used, or none when the answer does not have one. */
	static List<String> loreTermsOf(String reply) {
		List<String> terms = new ArrayList<>();
		try {
			for (JsonNode term : JSON.readTree(stripFence(reply)).path("loreTerms")) {
				String text = term.asString("").strip();
				if (!text.isEmpty() && text.length() <= 60) {
					terms.add(text);
				}
			}
		}
		catch (RuntimeException ex) {
			// no usable list: the checks that need none still run
		}
		return terms;
	}

	/**
	 * The lore's invented words that must not stand in the prompt: those the model reported plus the capitalised words of its own character fields, kept
	 * only when the lore really uses them as names (written with a capital, and never as an ordinary lowercase word, so "Metal" the material is not one).
	 */
	static List<String> loreTerms(Draft draft, List<String> reported, String lore) {
		List<String> candidates = new ArrayList<>(reported);
		var fields = draft.character();
		if (fields != null) {
			for (String field : new String[] { fields.tier(), fields.who(), fields.race(), fields.role(), fields.signature() }) {
				for (String word : nullToEmpty(field).split("[^\\p{L}'-]+")) {
					if (word.length() >= 4 && java.lang.Character.isUpperCase(word.charAt(0))) {
						candidates.add(word);
					}
				}
			}
		}
		List<String> terms = new ArrayList<>();
		for (String candidate : candidates) {
			if (isLoreName(candidate, lore) && terms.stream().noneMatch(candidate::equalsIgnoreCase)) {
				terms.add(candidate);
			}
		}
		return terms;
	}

	/** A name the lore invented: written exactly so in the lore, and never as the same word in lowercase. */
	static boolean isLoreName(String term, String lore) {
		if (lore == null || lore.isBlank() || term == null || term.length() < 3 || !lore.contains(term)) {
			return false;
		}
		return !Pattern.compile("(?<![\\p{L}])" + Pattern.quote(term.toLowerCase(Locale.ROOT)) + "(?![\\p{L}])").matcher(lore).find();
	}

	/**
	 * A term of the --no list that the sentences also say with "no", "never" or "without" ("no humanoid features, no armor plating"). Returns the offending
	 * phrase, or null.
	 */
	static String restatedProhibition(String prompt) {
		String text = prompt == null ? "" : prompt;
		int no = text.indexOf(" --no ");
		if (no < 0) {
			return null;
		}
		String body = bodyOf(text);
		String list = text.substring(no + 6);
		int next = list.indexOf(" --");
		for (String term : (next < 0 ? list : list.substring(0, next)).split(",")) {
			String clean = term.strip().toLowerCase(Locale.ROOT);
			if (clean.length() >= 4) {
				var found = Pattern.compile("\\b(no|never|without)\\s+" + Pattern.quote(clean) + "\\b", Pattern.CASE_INSENSITIVE).matcher(body);
				if (found.find()) {
					return found.group();
				}
			}
		}
		return null;
	}

	/**
	 * In NICKNAME mode nothing of the printed name may carry over. Returns the word that gives it away, or null when the answer is clear of it: a
	 * distinctive word of the printed name in the nickname, the whole printed name in the prompt, or one of its distinctive words in the prompt when the
	 * lore itself does not use that word (so a hide called "copper" because the card is "Copper Dragon" is caught, but one the lore calls copper is not).
	 */
	static String echoOfPrintedName(CardFacts card, Mode mode, Draft draft, String lore) {
		if (mode != Mode.NICKNAME || card.name() == null || card.name().isBlank()) {
			return null;
		}
		String name = card.name().toLowerCase(Locale.ROOT).strip();
		String prompt = draft.prompt() == null ? "" : draft.prompt().toLowerCase(Locale.ROOT);
		if (prompt.contains(name)) {
			return name;
		}
		String nickname = draft.nickname() == null ? "" : draft.nickname().toLowerCase(Locale.ROOT);
		String body = bodyOf(prompt);
		String loreText = lore == null ? "" : lore.toLowerCase(Locale.ROOT);
		String type = nullToEmpty(card.typeLine()).toLowerCase(Locale.ROOT);
		for (String word : name.split("[^a-z]+")) {
			if (word.length() < 4 || FILLER.contains(word)) {
				continue;
			}
			// a creature type in the type line ("Dragon") is what the card is, not imagery from its name: the prompt may say it
			boolean inType = Pattern.compile("(?<![a-z])" + Pattern.quote(word) + "s?(?![a-z])").matcher(type).find();
			Pattern whole = Pattern.compile("(?<![a-z])" + Pattern.quote(word) + "s?(?![a-z])");
			if (whole.matcher(nickname).find() || (!inType && whole.matcher(body).find() && !whole.matcher(loreText).find())) {
				return word;
			}
		}
		return null;
	}

	static String echoOfPrintedName(CardFacts card, Mode mode, Draft draft) {
		return echoOfPrintedName(card, mode, draft, "");
	}

	/** Every card is printed 5:7, so a reply that forgot the ratio gets it here instead of depending on the model. */
	static String withAspect(String prompt) {
		// A comma or semicolon left in front of a parameter is the model's habit, and Midjourney reads it as part of the text.
		String tidy = prompt.replaceAll("[,;]\\s*(?=--)", " ").replaceAll("\\s{2,}", " ");
		String withRatio = tidy.contains("--ar ") ? tidy : tidy + " --ar 5:7";
		// the closing suffix always has a --no list: a model that left it out gets the plain one instead of none
		return withRatio.contains("--no ") ? withRatio : withRatio + " --no text, watermark, signature";
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

	private static String blank(String value) {
		return value == null ? "" : value.strip();
	}

	private static String nullToEmpty(String value) {
		return value == null ? "" : value;
	}
}
