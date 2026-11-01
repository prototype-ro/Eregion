package io.eregion.render;

public record FrameSelection(
	String frameFamily,
	String templateSlot,
	String borderTreatment,
	String title,
	String subtitle
) {}
