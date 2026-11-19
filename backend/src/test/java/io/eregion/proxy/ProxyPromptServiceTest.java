package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;

class ProxyPromptServiceTest {

	/** Answers from a script, one reply per call, and remembers what it was asked. */
	static class Scripted implements LlmClient {

		final List<String> replies;
		final List<String> users = new ArrayList<>();
		final List<String> systems = new ArrayList<>();

		Scripted(String... replies) {
			this.replies = new ArrayList<>(List.of(replies));
		}

		@Override
		public String complete(String system, String user) {
			systems.add(system);
			users.add(user);
			return replies.remove(0);
		}

		@Override
		public String modelName() {
			return "fake";
		}
	}

	/** Like {@link Scripted}, but also answers free-form chat (the brainstorm pass) with a fixed reply. */
	static class ScriptedWithChat extends Scripted {

		final String chatReply;
		final List<String> chatAsks = new ArrayList<>();

		ScriptedWithChat(String chatReply, String... replies) {
			super(replies);
			this.chatReply = chatReply;
		}

		@Override
		public String chat(String system, List<Turn> turns) {
			chatAsks.add(turns.get(0).content());
			return chatReply;
		}
	}

	static final String GOOD_NICKNAME = """
			{"nickname":"Sildarion","character":{"tier":"Lathaar-tier","who":"a calm toll-keeper","race":"unfallen spirit","role":"sentinel","signature":"a gold coin held mid-fall"},"prompt":"tall silver-haired figure on a cliff, gold coin mid-fall above an open palm"}
			""";
	static final String GOOD_RESKIN = """
			{"character":{"tier":"Maelgrith-submitted","who":"a faceless sovereign","race":"void spirit","role":"thief","signature":"a violet seam between two crown spires"},"prompt":"faceless crowned figure reaching into a violet tear"}
			""";

	static final CardFacts SENTINEL = new CardFacts("Esper Sentinel", "{W}", "Artifact Creature - Human Soldier", "W",
			"Whenever an opponent casts their first noncreature spell each turn, draw a card unless they pay X.");

	ProxyPromptService service(LlmClient llm) {
		return new ProxyPromptService(llm);
	}

	@Test
	void nicknameModeReturnsNameCharacterAndPrompt() {
		Draft draft = service(new Scripted(GOOD_NICKNAME)).generate("LORE TEXT", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(draft.nickname()).isEqualTo("Sildarion");
		assertThat(draft.character().tier()).isEqualTo("Lathaar-tier");
		assertThat(draft.prompt()).contains("gold coin");
	}

	@Test
	void aReplyWithoutAnAspectRatioGetsOne() {
		Draft draft = service(new Scripted(GOOD_NICKNAME)).generate("LORE TEXT", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(draft.prompt()).endsWith("open palm --ar 5:7 --no text, watermark, signature");
	}

	@Test
	void aReplyThatAlreadyHasAnAspectRatioIsLeftAlone() {
		assertThat(ProxyPromptService.withAspect("a lantern --ar 5:7 --no hands")).isEqualTo("a lantern --ar 5:7 --no hands");
	}

	@Test
	void aCommaLeftBeforeAParameterIsRemoved() {
		assertThat(ProxyPromptService.withAspect("a ravine, one tiny pilgrim for scale only, --ar 5:7 --no crowd, text"))
				.isEqualTo("a ravine, one tiny pilgrim for scale only --ar 5:7 --no crowd, text");
		assertThat(ProxyPromptService.withAspect("a ravine, for scale only,")).isEqualTo("a ravine, for scale only, --ar 5:7 --no text, watermark, signature");
	}

	@Test
	void reskinModeKeepsNoNickname() {
		Draft draft = service(new Scripted(GOOD_RESKIN)).generate("LORE TEXT", SENTINEL, Mode.RESKIN, List.of(), null, null, false, false);

		assertThat(draft.nickname()).isNull();
		assertThat(draft.character().who()).isEqualTo("a faceless sovereign");
	}

	@Test
	void theRequestCarriesLoreCardEarlierPicksAndTheRefineContext() {
		var llm = new Scripted(GOOD_NICKNAME);
		var earlier = List.of(new Pick("Lord of the Void", null, "Maelgrith-submitted", "a cracked void-stone"),
				new Pick("Esper Sentinel", "Old Name", "Lathaar-tier", "a raised shield"));
		var previous = new Draft("Old Name", new ProxyDtos.Character("Lathaar-tier", "w", "r", "o", "s"), "old prompt text");

		service(llm).generate("LORE TEXT", SENTINEL, Mode.NICKNAME, earlier, previous, "make the armor darker", false, false);

		String user = llm.users.get(0);
		assertThat(user).contains("LORE TEXT").contains("Esper Sentinel").contains("draw a card unless they pay X");
		assertThat(user).contains("Lord of the Void").contains("Maelgrith-submitted");
		assertThat(user).contains("a cracked void-stone").contains("a raised shield");
		assertThat(user).contains("old prompt text").contains("make the armor darker");
		assertThat(user).contains("NICKNAME");
		assertThat(llm.systems.get(0)).isNotBlank();
	}

	static final CardFacts COPPER = new CardFacts("Ancient Copper Dragon", "{4}{R}{R}", "Creature - Elder Dragon", "R",
			"Whenever Ancient Copper Dragon deals combat damage to a player, roll a d20. Create a number of Treasure tokens equal to the result.");

	@Test
	void ignoreTypeWithholdsThePrintedTypeAndLetsTheLoreDecide() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, true, false);

		String user = llm.users.get(0);
		assertThat(user).doesNotContain("Elder Dragon").contains("not binding").contains("Let the deck lore decide entirely what this subject actually is");
	}

	@Test
	void withoutIgnoreTypeThePrintedTypeIsSent() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(llm.users.get(0)).contains("Creature - Elder Dragon").doesNotContain("not binding");
	}

	@Test
	void ignoreRulesTextWithholdsTheRulesTextItself() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, true);

		String user = llm.users.get(0);
		assertThat(user).doesNotContain("roll a d20").doesNotContain("Treasure tokens").contains("withheld on purpose");
	}

	@Test
	void withoutIgnoreRulesTextTheRulesTextIsSent() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(llm.users.get(0)).contains("roll a d20");
	}

	@Test
	void loreOnlySendsTheModelNothingOfTheCardButItsCreatureType() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false, true);

		String user = llm.users.get(0);
		assertThat(user).contains("Creature type: Elder Dragon").contains("LORE TEXT");
		assertThat(user).doesNotContain("Ancient Copper Dragon").doesNotContain("{4}{R}{R}").doesNotContain("Colors:").doesNotContain("Mana cost")
				.doesNotContain("roll a d20").doesNotContain("Treasure").doesNotContain("Rules text");
	}

	@Test
	void theChatNeverSendsTheWithheldPartsOfTheCardEither() {
		String system = ProxyPromptService.chatSystem("LORE TEXT", COPPER, Mode.NICKNAME, true, true, null);

		assertThat(system).contains("LORE TEXT").contains("Mode: NICKNAME").contains("withheld on purpose");
		assertThat(system).doesNotContain("Ancient Copper Dragon").doesNotContain("Elder Dragon").doesNotContain("roll a d20").doesNotContain("Treasure");
	}

	@Test
	void theChatInLoreOnlyModeSendsOnlyTheCreatureType() {
		String system = ProxyPromptService.chatSystem("LORE TEXT", COPPER, Mode.NICKNAME, false, false, true, null);

		assertThat(system).contains("Creature type: Elder Dragon");
		assertThat(system).doesNotContain("Ancient Copper Dragon").doesNotContain("{4}{R}{R}").doesNotContain("Colors:").doesNotContain("roll a d20");
	}

	@Test
	void theChatSendsTheWholeCardWhenNothingIsTurnedOff() {
		String system = ProxyPromptService.chatSystem("LORE TEXT", COPPER, Mode.RESKIN, false, false, null);

		assertThat(system).contains("Name: Ancient Copper Dragon").contains("Creature - Elder Dragon").contains("roll a d20");
	}

	@Test
	void loreOnlyAlsoHidesTheNameInReskinMode() {
		var llm = new Scripted(GOOD_RESKIN);

		service(llm).generate("LORE TEXT", COPPER, Mode.RESKIN, List.of(), null, null, false, false, true);

		assertThat(llm.users.get(0)).doesNotContain("Ancient Copper Dragon");
	}

	@Test
	void loreOnlyKeepsOnlyThePlainTypeOfACardThatIsNotACreature() {
		assertThat(ProxyPromptService.typeOnly(new CardFacts("Sol Ring", "{1}", "Artifact", "", ""))).isEqualTo("Card type: Artifact");
		assertThat(ProxyPromptService.typeOnly(new CardFacts("Skullclamp", "{1}", "Artifact \u2014 Equipment", "", ""))).isEqualTo("Card type: Artifact (Equipment)");
		assertThat(ProxyPromptService.typeOnly(new CardFacts("Command Tower", "", "Land", "", ""))).isEqualTo("Card type: Land");
		assertThat(ProxyPromptService.typeOnly(new CardFacts("Kaalia", "{R}{W}{B}", "Legendary Creature \u2014 Human Cleric", "", ""))).isEqualTo("Creature type: Human Cleric");
		assertThat(ProxyPromptService.typeOnly(new CardFacts("X", "", "Artifact Creature - Construct", "", ""))).isEqualTo("Creature type: Construct");
		assertThat(ProxyPromptService.typeOnly(new CardFacts("Y", "", "Legendary Sorcery", "", ""))).isEqualTo("Card type: Sorcery");
	}

	@Test
	void withoutLoreOnlyTheCardIsSentAsBefore() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false, false);

		assertThat(llm.users.get(0)).contains("Mana cost: {4}{R}{R}").contains("Colors: R").doesNotContain("Creature type:");
	}

	@Test
	void inNicknameModeThePrintedNameIsNeverSent() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(llm.users.get(0)).doesNotContain("Ancient Copper Dragon").contains("Name: (withheld on purpose");
	}

	@Test
	void aRulesTextThatNamesItsOwnCardDoesNotGiveTheNameBack() {
		assertThat(ProxyPromptService.withoutName(COPPER, "Whenever Ancient Copper Dragon deals combat damage, roll a d20. ancient copper dragon wins."))
				.isEqualTo("Whenever this card deals combat damage, roll a d20. this card wins.");
		var twoFaced = new CardFacts("Delver of Secrets // Insectile Aberration", "{U}", "Creature", "U", "Delver of Secrets transforms.");
		assertThat(ProxyPromptService.withoutName(twoFaced, "Delver of Secrets transforms.")).isEqualTo("this card transforms.");
	}

	@Test
	void inReskinModeThePrintedNameIsSentBecauseTheCardKeepsIt() {
		var llm = new Scripted(GOOD_RESKIN);

		service(llm).generate("LORE TEXT", COPPER, Mode.RESKIN, List.of(), null, null, false, false);

		assertThat(llm.users.get(0)).contains("Name: Ancient Copper Dragon");
	}

	@Test
	void aNicknameThatRepeatsAWordOfThePrintedNameIsRejectedAndTheReasonIsSentBack() {
		String echoing = GOOD_NICKNAME.replace("Sildarion", "Korvathiel, the Copper-Veined Warden");
		var llm = new Scripted(echoing, GOOD_NICKNAME);

		Draft draft = service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, true, true);

		assertThat(draft.nickname()).isEqualTo("Sildarion");
		assertThat(llm.users).hasSize(2);
		assertThat(llm.users.get(1)).contains("Your previous answer was rejected").contains("\"copper\"");
	}

	@Test
	void theCreatureTypeOfTheCardMayStandInThePromptEvenWhenTheNameHasTheWord() {
		var draft = withPrompt("Korvathiel", "a vast dragon crouched on a ledge --ar 5:7 --no halo", "t", "r");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), "A warden keeps ore.")).isNull();
	}

	@Test
	void aPromptThatContainsTheWholePrintedNameIsRejected() {
		String echoing = GOOD_NICKNAME.replace("tall silver-haired figure", "ancient copper dragon, tall silver-haired figure");

		assertThat(ProxyPromptService.echoOfPrintedName(COPPER, Mode.NICKNAME, new Draft("Sildarion", null, echoing))).isEqualTo("ancient copper dragon");
	}

	@Test
	void aNicknameThatSharesOnlyFillerWordsWithThePrintedNameIsFine() {
		var card = new CardFacts("Rise of the Dark Realms", "{7}{B}{B}", "Sorcery", "B", "");

		assertThat(ProxyPromptService.echoOfPrintedName(card, Mode.NICKNAME, new Draft("The Hollow Crowned", null, "a crown"))).isNull();
	}

	@Test
	void aWordOfThePrintedNameInsideAnotherWordIsNotAnEcho() {
		var card = new CardFacts("Iron Fist", "{2}", "Artifact", "", "");

		// "ironic" contains "iron" but is not it
		assertThat(ProxyPromptService.echoOfPrintedName(card, Mode.NICKNAME, new Draft("An Ironic Gift", null, "a gift"))).isNull();
		assertThat(ProxyPromptService.echoOfPrintedName(card, Mode.NICKNAME, new Draft("The Iron Vow", null, "a vow"))).isEqualTo("iron");
	}

	static final String LORE = "The Ormaeth are dragons made to keep, in three Holds. Maelgrith erases. A warden of the Metal Hold keeps ore and living metal.";

	private static Draft withPrompt(String nickname, String prompt, String tier, String race) {
		return new Draft(nickname, new ProxyDtos.Character(tier, "w", race, "r", "s"), prompt);
	}

	@Test
	void aPromptThatUsesAWordOnlyTheLoreInventedIsRefused() {
		var draft = withPrompt("Korvathiel", "a vast Ormaeth dragon, burnished hide --ar 5:7 --no halo", "Mid-transformation", "Ormaeth");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), LORE)).contains("\"Ormaeth\"").contains("cannot read");
	}

	@Test
	void aWordTheModelReportedAsALoreTermIsRefusedToo() {
		var draft = withPrompt("Korvathiel", "a dragon of the Maelgrith whisper --ar 5:7", "t", "dragon");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of("Maelgrith"), LORE)).contains("\"Maelgrith\"");
	}

	@Test
	void anOrdinaryWordTheLoreAlsoWritesInLowercaseIsNotALoreName() {
		// "Metal" appears in the lore only inside "Metal Hold" but "metal" is an ordinary word there, so a metal hide is fine
		var draft = withPrompt("Korvathiel", "heavy dragon with a burnished living metal hide --ar 5:7 --no halo", "Metal", "dragon");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of("Metal"), "A warden of the Metal Hold keeps ore and living metal.")).isNull();
	}

	@Test
	void withNoLoreNoWordIsTreatedAsInvented() {
		var draft = withPrompt("Korvathiel", "an Ormaeth dragon --ar 5:7", "t", "Ormaeth");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of("Ormaeth"), "")).isNull();
	}

	@Test
	void aRuleOfTheLoreRestatedInTheSentencesIsRefused() {
		String prompt = "dragon crouching on a ledge, no humanoid features, no armor plating, living metal only --ar 5:7 --no armor plating, humanoid features, halo";

		assertThat(ProxyPromptService.restatedProhibition(prompt)).isEqualTo("no armor plating");
		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, withPrompt("Korvathiel", prompt, "t", "dragon"), List.of(), LORE)).contains("prohibitions belong only in the --no list");
	}

	@Test
	void aNaturalNoInTheSentencesIsNotAProhibitionFromTheNoList() {
		String prompt = "a seam no wider than a hair, never-ending dusk --ar 5:7 --no halo, text";

		assertThat(ProxyPromptService.restatedProhibition(prompt)).isNull();
	}

	@Test
	void aPrintedNameWordInThePromptIsRefusedUnlessTheLoreUsesIt() {
		var draft = withPrompt("Korvathiel", "dragon with warm copper hide --ar 5:7 --no halo", "t", "dragon");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), LORE)).contains("\"copper\"");
		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), LORE + " Its hide is hammered copper.")).isNull();
	}

	@Test
	void aDragonReadingScrollsOrBesideAWheelbarrowIsRefused() {
		assertThat(ProxyPromptService.humanThingOnABeast("a pale serpentine dragon reading cracked scrolls beside a brazier")).isEqualTo("reading");
		assertThat(ProxyPromptService.humanThingOnABeast("a copper dragon on a ledge, a wheelbarrow below")).isEqualTo("wheelbarrow");
		var draft = withPrompt("Korvathiel", "an antlered dragon studying a book in a stone cell --ar 5:7 --no halo", "t", "dragon");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), LORE)).contains("never reads, writes or studies");
	}

	@Test
	void aBeastOnTheLoresOwnGroundIsFine() {
		assertThat(ProxyPromptService.humanThingOnABeast("a dragon coiled on a ruined wall above a battlefield of soldiers, a heap of crowns")).isNull();
		// people may read: the check is only for dragons and other beasts
		assertThat(ProxyPromptService.humanThingOnABeast("an archivist reading a scroll by candlelight")).isNull();
	}

	@Test
	void aChosenTierIsPutInTheRequestAndTheModelIsToldToUseItExactly() {
		var llm = new Scripted(GOOD_NICKNAME.replace("Lathaar-tier", "Aelathir-tier"));

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false, false, "Aelathir-tier");

		assertThat(llm.users.get(0)).contains("# Required tier").contains("\"Aelathir-tier\"").contains("do not choose another tier");
	}

	@Test
	void withNoTierChosenNothingIsAddedToTheRequest() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false, false, "  ");

		assertThat(llm.users.get(0)).doesNotContain("Required tier");
	}

	@Test
	void anAnswerInAnotherTierThanTheOneChosenIsRefusedAndRetried() {
		var llm = new Scripted(GOOD_NICKNAME, GOOD_NICKNAME.replace("Lathaar-tier", "Aelathir-tier"));

		Draft draft = service(llm).generate("LORE TEXT", COPPER, Mode.NICKNAME, List.of(), null, null, false, false, false, "Aelathir-tier");

		assertThat(draft.character().tier()).isEqualTo("Aelathir-tier");
		assertThat(llm.users).hasSize(2);
		assertThat(llm.users.get(1)).contains("Your previous answer was rejected").contains("the tier field says \"Lathaar-tier\"");
	}

	@Test
	void theTierFieldMayWrapTheChosenTierInMoreWords() {
		var draft = withPrompt("Korvathiel", "a vast dragon on a ledge --ar 5:7 --no halo", "The Aelathir-tier hoard-lord", "dragon");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), LORE, "aelathir-tier")).isNull();
	}

	@Test
	void aDragonWithAnAudienceOfSmallerDrakesIsRefused() {
		assertThat(ProxyPromptService.audienceOfBeasts("a steel dragon on a ledge, five smaller drakes of grey stone sit below, watching")).isEqualTo("five smaller");
		assertThat(ProxyPromptService.audienceOfBeasts("a steel dragon on a ledge above a valley")).isNull();
		assertThat(ProxyPromptService.audienceOfBeasts("five smaller boats on a harbour")).isNull();
	}

	@Test
	void aBrazierOrLanternLightingADragonsSceneIsRefused() {
		assertThat(ProxyPromptService.humanThingOnABeast("a steel dragon on a ledge, the faint amber of a distant brazier")).isEqualTo("brazier");
		assertThat(ProxyPromptService.humanThingOnABeast("a dragon, a lantern at the far end of the ledge")).isEqualTo("lantern");
		assertThat(ProxyPromptService.humanThingOnABeast("a dragon breathing fire over a ruined wall")).isNull();
	}

	@Test
	void aPromptOfMoreThanOneHundredFortyWordsIsRefusedWithItsLength() {
		String longBody = "a steel dragon on a ledge " + "with one more plain detail ".repeat(30);
		var draft = withPrompt("Korvathiel", longBody + " --ar 5:7 --no halo", "t", "dragon");

		assertThat(ProxyPromptService.problemWith(COPPER, Mode.NICKNAME, draft, List.of(), LORE)).contains("words: cut it to about 90");
	}

	@Test
	void aPromptWithoutANoListGetsThePlainOne() {
		assertThat(ProxyPromptService.withAspect("a steel dragon on a ledge --ar 5:7")).isEqualTo("a steel dragon on a ledge --ar 5:7 --no text, watermark, signature");
		assertThat(ProxyPromptService.withAspect("a steel dragon --ar 5:7 --no halo")).isEqualTo("a steel dragon --ar 5:7 --no halo");
	}

	@Test
	void aRefusedAnswerIsRetriedUpToThreeTimes() {
		String ormaeth = GOOD_NICKNAME.replace("tall silver-haired figure", "an Ormaeth dragon, tall silver-haired figure").replace("\"race\":\"unfallen spirit\"", "\"race\":\"Ormaeth\"");
		var llm = new Scripted(ormaeth, ormaeth, GOOD_NICKNAME);

		Draft draft = service(llm).generate(LORE, COPPER, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(draft.nickname()).isEqualTo("Sildarion");
		assertThat(llm.users).hasSize(3);
		assertThat(llm.users.get(2)).contains("Your previous answer was rejected").contains("Ormaeth");
	}

	@Test
	void reskinModeMayKeepThePrintedName() {
		assertThat(ProxyPromptService.echoOfPrintedName(COPPER, Mode.RESKIN, new Draft(null, null, "ancient copper dragon over a hoard"))).isNull();
	}

	@Test
	void aReplyInACodeFenceIsStillRead() {
		var llm = new Scripted("```json\n" + GOOD_NICKNAME + "\n```");

		assertThat(service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false).nickname()).isEqualTo("Sildarion");
	}

	@Test
	void aMalformedReplyIsRetriedOnce() {
		var llm = new Scripted("not json at all", GOOD_NICKNAME);

		Draft draft = service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(draft.nickname()).isEqualTo("Sildarion");
		assertThat(llm.users).hasSize(2);
	}

	@Test
	void twoBadRepliesFailWithAMessage() {
		var llm = new Scripted("nope", "{\"character\":{\"who\":\"x\"}}", "still nope");

		assertThatThrownBy(() -> service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("could not be read");
		assertThat(llm.users).hasSize(3);
	}

	@Test
	void nicknameModeRequiresANickname() {
		var llm = new Scripted(GOOD_RESKIN, GOOD_RESKIN, GOOD_RESKIN);

		assertThatThrownBy(() -> service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false)).isInstanceOf(ApiException.class);
	}

	@Test
	void anOverLongFieldIsRejectedAndTheRetrySucceeds() {
		String tooLong = GOOD_NICKNAME.replace("a calm toll-keeper", "x".repeat(401));
		var llm = new Scripted(tooLong, GOOD_NICKNAME);

		Draft draft = service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(draft.character().who()).isEqualTo("a calm toll-keeper");
		assertThat(llm.users).hasSize(2);
	}

	static final CardFacts REMOVAL_INSTANT = new CardFacts("Lightning Strike", "{1}{R}", "Instant", "R",
			"Lightning Strike deals 3 damage to any target.");

	@Test
	void anInstantsUserMessageIncludesRealArtAnchors() {
		var llm = new Scripted(GOOD_RESKIN);

		service(llm).generate("L", REMOVAL_INSTANT, Mode.RESKIN, List.of(), null, null, false, false);

		assertThat(llm.users.get(0)).contains("Real-art reference anchors");
	}

	@Test
	void anchorsAreNotSentWhenTheRulesTextIsWithheld() {
		var llm = new Scripted(GOOD_RESKIN);

		service(llm).generate("L", REMOVAL_INSTANT, Mode.RESKIN, List.of(), null, null, false, true);

		assertThat(llm.users.get(0)).doesNotContain("Real-art reference anchors");
	}

	@Test
	void aNonInstantCardGetsNoArchiveAnchors() {
		var llm = new Scripted(GOOD_NICKNAME);

		service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(llm.users.get(0)).doesNotContain("Real-art reference anchors");
	}

	@Test
	void aSuccessfulBrainstormIsCommittedIntoTheFinalCall() {
		var llm = new ScriptedWithChat("Register: collision. Concept: a bear trap closing on a wolf's leg.", GOOD_RESKIN);

		service(llm).generate("L", REMOVAL_INSTANT, Mode.RESKIN, List.of(), null, null, false, false);

		assertThat(llm.chatAsks).hasSize(1);
		assertThat(llm.chatAsks.get(0)).contains("brainstorm only, do not write JSON yet");
		assertThat(llm.users.get(0)).contains("Committed concept").contains("bear trap closing on a wolf's leg");
	}

	@Test
	void aFailedBrainstormDoesNotBreakGeneration() {
		var llm = new Scripted(GOOD_RESKIN);

		Draft draft = service(llm).generate("L", REMOVAL_INSTANT, Mode.RESKIN, List.of(), null, null, false, false);

		assertThat(draft.prompt()).isNotBlank();
		assertThat(llm.users.get(0)).doesNotContain("Committed concept");
	}

	@Test
	void creaturesDoNotGetABrainstormPass() {
		var llm = new ScriptedWithChat("should never be asked", GOOD_NICKNAME);

		service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null, false, false);

		assertThat(llm.chatAsks).isEmpty();
	}

	@Test
	void theInstantArchiveFileParsesIntoUsableEntries() {
		List<ProxyPromptService.ArchiveEntry> entries = ProxyPromptService.loadArchive("/instant-reference-prompts.md");

		assertThat(entries).isNotEmpty();
		assertThat(entries).allSatisfy(e -> {
			assertThat(e.name()).isNotBlank();
			assertThat(e.register()).isNotBlank();
			assertThat(e.prompt()).isNotBlank();
		});
	}
}
