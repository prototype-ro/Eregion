package io.eregion.card;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Brings a card name to a plain form for matching: lower case, no accents, ligatures spelled out, curly
 * quotes and dashes made plain, spaces collapsed. "Atraxa, Praetors’ Voice", "ATRAXA, PRAETORS' VOICE"
 * and "Æther Vial" / "Aether Vial" each become one form. The database function eregion_norm does the same
 * for stored names, so the two must stay in step.
 */
public final class NameNormalizer {

	private NameNormalizer() {
	}

	public static String normalize(String name) {
		if (name == null) {
			return "";
		}
		String text = name
				.replace('‘', '\'').replace('’', '\'').replace('ʼ', '\'').replace('´', '\'').replace('`', '\'')
				.replace('“', '"').replace('”', '"')
				.replace('‐', '-').replace('‑', '-').replace('‒', '-').replace('–', '-').replace('—', '-')
				.replace("Æ", "AE").replace("æ", "ae").replace("Œ", "OE").replace("œ", "oe").replace("ß", "ss");
		String stripped = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
		return stripped.replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
	}

	/** The name with plain quotes, which Scryfall finds more reliably than curly ones. */
	public static String forSearch(String name) {
		return name == null ? "" : name.replace('‘', '\'').replace('’', '\'').replace('ʼ', '\'').replace('`', '\'')
				.replace('“', '"').replace('”', '"').replaceAll("\\s+", " ").trim();
	}
}
