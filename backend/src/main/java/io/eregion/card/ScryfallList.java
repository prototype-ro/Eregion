package io.eregion.card;

import java.util.List;

/** Scryfall's paged list envelope. Only the cards are read. */
public record ScryfallList(List<ScryfallCard> data) {
}
