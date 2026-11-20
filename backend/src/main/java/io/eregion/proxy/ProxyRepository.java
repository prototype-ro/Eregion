package io.eregion.proxy;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import io.eregion.proxy.ProxyDtos.Character;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Lore;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;
import io.eregion.proxy.ProxyDtos.Treatment;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class ProxyRepository {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String GENERATION_COLUMNS = "g.id AS g_id, g.created_at AS g_created, g.instruction AS g_instruction, "
			+ "g.nickname AS g_nickname, g.character_json AS g_character, g.prompt AS g_prompt, g.model AS g_model";

	private final JdbcClient jdbc;

	public ProxyRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public boolean ownsDeck(UUID deckId, UUID userId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM decks WHERE id = :deck AND owner_id = :user AND deleted_at IS NULL)")
				.param("deck", deckId).param("user", userId).query(Boolean.class).single();
	}

	public Lore lore(UUID deckId) {
		return jdbc.sql("SELECT lore, mj_params FROM decks WHERE id = :deck")
				.param("deck", deckId)
				.query((rs, n) -> new Lore(rs.getString("lore"), rs.getString("mj_params")))
				.single();
	}

	public void saveLore(UUID deckId, String lore, String mjParams) {
		jdbc.sql("UPDATE decks SET lore = :lore, mj_params = :params WHERE id = :deck")
				.param("lore", blankToNull(lore)).param("params", blankToNull(mjParams)).param("deck", deckId).update();
	}

	/** Only the Midjourney parameters, so the Proxies section never overwrites the digest the Lore section writes. */
	public void saveMjParams(UUID deckId, String mjParams) {
		jdbc.sql("UPDATE decks SET mj_params = :params WHERE id = :deck")
				.param("params", blankToNull(mjParams)).param("deck", deckId).update();
	}

	/** Every treatment of the deck with its current generation. */
	public List<Treatment> treatments(UUID deckId) {
		return jdbc.sql("""
				SELECT t.id, t.card_id, t.mode, t.current_generation_id, %s
				  FROM proxy_treatments t
				  LEFT JOIN proxy_generations g ON g.id = t.current_generation_id
				 WHERE t.deck_id = :deck
				 ORDER BY t.created_at
				""".formatted(GENERATION_COLUMNS))
				.param("deck", deckId)
				.query(ProxyRepository::treatment)
				.list();
	}

	public Optional<Treatment> treatment(UUID deckId, UUID cardId) {
		return jdbc.sql("""
				SELECT t.id, t.card_id, t.mode, t.current_generation_id, %s
				  FROM proxy_treatments t
				  LEFT JOIN proxy_generations g ON g.id = t.current_generation_id
				 WHERE t.deck_id = :deck AND t.card_id = :card
				""".formatted(GENERATION_COLUMNS))
				.param("deck", deckId).param("card", cardId)
				.query(ProxyRepository::treatment)
				.optional();
	}

	/** Stores a finished generation and makes it current, all or nothing. Returns the generation id. */
	@Transactional
	public UUID record(UUID deckId, UUID cardId, Mode mode, String instruction, Draft draft, String model) {
		UUID treatmentId = upsertTreatment(deckId, cardId, mode);
		UUID generationId = insertGeneration(treatmentId, instruction, draft, model);
		setCurrent(treatmentId, generationId);
		return generationId;
	}

	/** Creates the treatment for a card, or switches its mode. Returns its id. */
	public UUID upsertTreatment(UUID deckId, UUID cardId, Mode mode) {
		return jdbc.sql("""
				INSERT INTO proxy_treatments (deck_id, card_id, mode) VALUES (:deck, :card, :mode)
				ON CONFLICT (deck_id, card_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()
				RETURNING id
				""")
				.param("deck", deckId).param("card", cardId).param("mode", mode.name())
				.query(UUID.class).single();
	}

	public UUID insertGeneration(UUID treatmentId, String instruction, Draft draft, String model) {
		return jdbc.sql("""
				INSERT INTO proxy_generations (treatment_id, instruction, nickname, character_json, prompt, model)
				VALUES (:treatment, :instruction, :nickname, :character, :prompt, :model) RETURNING id
				""")
				.param("treatment", treatmentId)
				.param("instruction", blankToNull(instruction))
				.param("nickname", draft.nickname())
				.param("character", JSON.writeValueAsString(draft.character()))
				.param("prompt", draft.prompt())
				.param("model", model)
				.query(UUID.class).single();
	}

	public void setCurrent(UUID treatmentId, UUID generationId) {
		jdbc.sql("UPDATE proxy_treatments SET current_generation_id = :gen, updated_at = now() WHERE id = :id")
				.param("gen", generationId).param("id", treatmentId).update();
	}

	/** True when the generation belongs to that treatment, so one player cannot point at another's rows. */
	public boolean generationBelongs(UUID treatmentId, UUID generationId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM proxy_generations WHERE id = :gen AND treatment_id = :treatment)")
				.param("gen", generationId).param("treatment", treatmentId).query(Boolean.class).single();
	}

	public List<Generation> history(UUID treatmentId) {
		return jdbc.sql("SELECT " + GENERATION_COLUMNS + " FROM proxy_generations g WHERE g.treatment_id = :treatment ORDER BY g.created_at DESC")
				.param("treatment", treatmentId)
				.query((rs, n) -> generation(rs))
				.list();
	}

	/** What the deck's other cards already have, for the model's context. */
	public List<Pick> picks(UUID deckId, UUID exceptCardId) {
		return jdbc.sql("""
				SELECT c.name, g.nickname, g.character_json
				  FROM proxy_treatments t
				  JOIN cards c ON c.id = t.card_id
				  JOIN proxy_generations g ON g.id = t.current_generation_id
				 WHERE t.deck_id = :deck AND t.card_id <> :card
				 ORDER BY t.created_at
				""")
				.param("deck", deckId).param("card", exceptCardId)
				.query((rs, n) -> {
					Character character = readCharacter(rs.getString("character_json"));
					return new Pick(rs.getString("name"), rs.getString("nickname"), character.tier(), character.signature());
				})
				.list();
	}

	private static Treatment treatment(ResultSet rs, int n) throws SQLException {
		UUID current = rs.getObject("current_generation_id", UUID.class);
		return new Treatment(rs.getObject("id", UUID.class), rs.getObject("card_id", UUID.class), Mode.valueOf(rs.getString("mode")), current,
				current == null ? null : generation(rs));
	}

	private static Generation generation(ResultSet rs) throws SQLException {
		return new Generation(rs.getObject("g_id", UUID.class), rs.getTimestamp("g_created").toInstant(), rs.getString("g_instruction"),
				rs.getString("g_nickname"), readCharacter(rs.getString("g_character")), rs.getString("g_prompt"), rs.getString("g_model"));
	}

	private static Character readCharacter(String json) {
		return JSON.readValue(json, Character.class);
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.strip();
	}
}
