package io.eregion.render;

import java.awt.Rectangle;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads a frame family's {@code layout.json} (fractional 0.0-1.0 regions, one set per template slot) and converts it
 * to a {@link FrameLayout} of pixel {@link Rectangle}s on the {@code FrameLayout.CARD_WIDTH}x{@code CARD_HEIGHT}
 * canvas.
 */
@Component
public class FrameLayoutLoader {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	public FrameLayout load(String frameFamily, String templateSlot) {
		String path = "/frames/" + frameFamily + "/layout.json";
		try (InputStream in = getClass().getResourceAsStream(path)) {
			if (in == null) {
				throw new IllegalStateException("No layout.json for frame family " + frameFamily);
			}
			JsonNode root = JSON.readTree(in);
			JsonNode slotNode = root.get(templateSlot);
			if (slotNode == null) {
				throw new IllegalStateException("Frame family " + frameFamily + " has no slot " + templateSlot);
			}
			Map<String, Rectangle> regions = new HashMap<>();
			Iterator<String> fieldNames = slotNode.propertyNames().iterator();
			while (fieldNames.hasNext()) {
				String field = fieldNames.next();
				JsonNode rect = slotNode.get(field);
				regions.put(field, new Rectangle(
						(int) Math.round(rect.get("x").asDouble() * FrameLayout.CARD_WIDTH),
						(int) Math.round(rect.get("y").asDouble() * FrameLayout.CARD_HEIGHT),
						(int) Math.round(rect.get("width").asDouble() * FrameLayout.CARD_WIDTH),
						(int) Math.round(rect.get("height").asDouble() * FrameLayout.CARD_HEIGHT)));
			}
			return new FrameLayout(regions);
		}
		catch (Exception e) {
			throw new IllegalStateException("Failed to load layout for " + frameFamily + "/" + templateSlot, e);
		}
	}
}
