package io.eregion.render;

import java.util.Set;

public class FrameSelector {

	public static final String DEFAULT_FAMILY = "m15";

	private final Set<String> familiesWithFullCoverage;

	public FrameSelector(Set<String> familiesWithFullCoverage) {
		this.familiesWithFullCoverage = familiesWithFullCoverage;
	}

	public FrameSelection select(
		String typeLine, String colors, String requestedFamily, String name, String nickname
	) {
		String templateSlot = resolveTemplateSlot(typeLine);
		String borderTreatment = resolveBorderTreatment(typeLine, colors);
		String frameFamily = familiesWithFullCoverage.contains(requestedFamily)
			? requestedFamily
			: DEFAULT_FAMILY;

		String title = nickname != null ? nickname : name;
		String subtitle = nickname != null ? name : null;

		return new FrameSelection(frameFamily, templateSlot, borderTreatment, title, subtitle);
	}

	private String resolveTemplateSlot(String typeLine) {
		String lower = typeLine.toLowerCase();
		if (lower.contains("land")) return "land";
		if (lower.contains("planeswalker")) return "planeswalker";
		if (lower.contains("artifact")) return "artifact";
		if (lower.contains("creature")) return "creature";
		if (lower.contains("enchantment")) return "enchantment";
		if (lower.contains("instant")) return "instant";
		if (lower.contains("sorcery")) return "sorcery";
		return "other";
	}

	private String resolveBorderTreatment(String typeLine, String colors) {
		String lower = typeLine.toLowerCase();
		if (lower.contains("land")) return "land";
		if (lower.contains("artifact")) return "artifact";
		if (colors.length() >= 2) return "multicolor";
		if (colors.length() == 1) return "mono-" + colors.charAt(0);
		return "colorless";
	}
}
