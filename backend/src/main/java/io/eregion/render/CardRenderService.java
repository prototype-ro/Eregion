package io.eregion.render;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Set;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.springframework.stereotype.Service;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;

/**
 * Composites a card's art, frame border and basic text into a single PNG, and stores it via
 * {@link CardRenderRepository}. Scoped down per the plan: rules text auto-fit, mana symbol substitution and
 * artist/collector/set-symbol rendering are explicit, documented follow-ups (see {@link #drawText}), not implemented
 * here.
 */
@Service
public class CardRenderService {

	private final CardRepository cardRepository;
	private final CardRenderRepository renderRepository;
	private final FrameSelector frameSelector;
	private final FrameLayoutLoader layoutLoader;
	private final DeckFrameSettingsRepository frameSettingsRepository;

	/**
	 * {@link FrameSelector} is a pure, unmanaged class (not a Spring bean), so it's constructed here rather than
	 * injected. Only the "m15" family has full asset coverage today (see {@code resources/frames}), so that's the
	 * only family {@link FrameSelector} is told it can honor; anything else falls back to
	 * {@code FrameSelector.DEFAULT_FAMILY}.
	 */
	public CardRenderService(
			CardRepository cardRepository,
			CardRenderRepository renderRepository,
			FrameLayoutLoader layoutLoader,
			DeckFrameSettingsRepository frameSettingsRepository
	) {
		this(cardRepository, renderRepository, new FrameSelector(Set.of(FrameSelector.DEFAULT_FAMILY)), layoutLoader, frameSettingsRepository);
	}

	CardRenderService(
			CardRepository cardRepository,
			CardRenderRepository renderRepository,
			FrameSelector frameSelector,
			FrameLayoutLoader layoutLoader,
			DeckFrameSettingsRepository frameSettingsRepository
	) {
		this.cardRepository = cardRepository;
		this.renderRepository = renderRepository;
		this.frameSelector = frameSelector;
		this.layoutLoader = layoutLoader;
		this.frameSettingsRepository = frameSettingsRepository;
	}

	public void render(UUID deckId, UUID cardId, byte[] artBytes) {
		Card card = cardRepository.findById(cardId)
				.orElseThrow(() -> new IllegalArgumentException("No card with id " + cardId));

		DeckFrameSettingsRepository.FrameSettingsRow settings = frameSettingsRepository.findByDeckId(deckId)
				.orElse(new DeckFrameSettingsRepository.FrameSettingsRow(deckId, null, null, FrameSelector.DEFAULT_FAMILY));

		FrameSelection selection = frameSelector.select(
				card.typeLine(), card.colors(), settings.frameFamily(), card.name(), null);

		FrameLayout layout = layoutLoader.load(selection.frameFamily(), selection.templateSlot());

		try {
			BufferedImage canvas = new BufferedImage(
					FrameLayout.CARD_WIDTH, FrameLayout.CARD_HEIGHT, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = canvas.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

			drawArt(g, layout, artBytes);
			drawFrameBorder(g, selection);
			drawText(g, layout, selection, card, settings);

			g.dispose();

			ByteArrayOutputStream out = new ByteArrayOutputStream();
			ImageIO.write(canvas, "png", out);

			renderRepository.upsert(deckId, cardId, out.toByteArray(), inputsHash(card, selection));
		}
		catch (IOException e) {
			throw new IllegalStateException("Failed to render card " + cardId + " for deck " + deckId, e);
		}
	}

	private void drawArt(Graphics2D g, FrameLayout layout, byte[] artBytes) throws IOException {
		Rectangle artBox = layout.region("artBox");
		BufferedImage art = ImageIO.read(new ByteArrayInputStream(artBytes));
		g.drawImage(art, artBox.x, artBox.y, artBox.width, artBox.height, null);
	}

	private void drawFrameBorder(Graphics2D g, FrameSelection selection) throws IOException {
		String path = "/frames/" + selection.frameFamily() + "/border-" + selection.borderTreatment() + ".png";
		try (InputStream in = getClass().getResourceAsStream(path)) {
			if (in == null) {
				throw new IllegalStateException("Missing frame border asset: " + path);
			}
			BufferedImage border = ImageIO.read(in);
			g.drawImage(border, 0, 0, FrameLayout.CARD_WIDTH, FrameLayout.CARD_HEIGHT, null);
		}
	}

	private void drawText(
			Graphics2D g, FrameLayout layout, FrameSelection selection, Card card,
			DeckFrameSettingsRepository.FrameSettingsRow settings
	) {
		g.setColor(Color.BLACK);

		Rectangle titleBox = layout.region("titleText");
		g.setFont(new Font("Serif", Font.BOLD, 48));
		g.drawString(selection.title(), titleBox.x, titleBox.y + titleBox.height);

		if (selection.subtitle() != null) {
			Rectangle typeLineBoxForSubtitle = layout.region("typeLineText");
			g.setFont(new Font("Serif", Font.ITALIC, 24));
			g.drawString(selection.subtitle(), typeLineBoxForSubtitle.x, typeLineBoxForSubtitle.y - 8);
		}

		Rectangle typeLineBox = layout.region("typeLineText");
		g.setFont(new Font("Serif", Font.PLAIN, 36));
		g.drawString(card.typeLine(), typeLineBox.x, typeLineBox.y + typeLineBox.height);

		if (card.power() != null && card.toughness() != null) {
			Rectangle ptBox = layout.region("ptBox");
			g.setFont(new Font("Serif", Font.BOLD, 40));
			g.drawString(card.power() + "/" + card.toughness(), ptBox.x, ptBox.y + ptBox.height);
		}

		// Rules text auto-shrink-to-fit, mana symbol icon substitution, and artist/collector/set-symbol rendering
		// (settings.artistName()/settings.collectionCode() are now available here but still intentionally not
		// drawn) are left as a documented follow-up -- finishing them needs the real symbol asset filenames
		// finalized against layout.json's artistCredit/collectorInfo/setSymbol regions. Do not silently skip this
		// note; it's a known, tracked gap.
	}

	private String inputsHash(Card card, FrameSelection selection) {
		return Integer.toHexString(
				(card.name() + selection.frameFamily() + selection.templateSlot() + selection.borderTreatment()).hashCode());
	}
}
