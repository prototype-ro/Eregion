package io.eregion.card;

import java.util.List;

/** Scryfall's paged list envelope. The cards, and where the next page is when there is one. */
public record ScryfallList(List<ScryfallCard> data, Boolean has_more, String next_page, Integer total_cards) {
}
