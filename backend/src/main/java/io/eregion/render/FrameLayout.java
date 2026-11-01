package io.eregion.render;

import java.awt.Rectangle;
import java.util.Map;

/** The pixel regions on an M15-sized card canvas (art, title, type line, etc.) for one template slot. */
public record FrameLayout(
		Map<String, Rectangle> regions // keys: artBox, titleText, manaCostArea, typeLineText, rulesTextBox, ptBox, artistCredit, collectorInfo, setSymbol
) {

	public static final int CARD_WIDTH = 2010;
	public static final int CARD_HEIGHT = 2814;

	public Rectangle region(String name) {
		Rectangle rect = regions.get(name);
		if (rect == null) {
			throw new IllegalStateException("No layout region named " + name);
		}
		return rect;
	}
}
