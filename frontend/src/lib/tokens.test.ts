import { test } from "node:test";
import assert from "node:assert/strict";
import { tokensNeeded } from "./tokens.ts";
import type { DeckCardLine } from "./types";

const card = (name: string, oracleText: string, board = "main") => ({ name, oracleText, board }) as unknown as DeckCardLine;

test("reads the tokens a deck makes and who makes them", () => {
  const tokens = tokensNeeded([
    card("Smothering Tithe", "Whenever an opponent draws a card, that player may pay {2}. If they don't, you create a Treasure token."),
    card("Dockside Extortionist", "When Dockside Extortionist enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control."),
    card("Raise the Alarm", "Create two 1/1 white Soldier creature tokens."),
    card("Grave Titan", "Deathtouch\nWhenever Grave Titan enters or attacks, create two 2/2 black Zombie creature tokens."),
    card("Helm of the Host", "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary."),
    card("Cultivate", "Search your library for up to two basic land cards."),
    card("Doubling Season", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."),
    card("Maybe Card", "Create a Food token.", "maybe"),
  ]);
  assert.deepEqual(
    tokens.map((t) => `${t.token}: ${t.makers.join(", ")}`),
    ["Treasure: Dockside Extortionist, Smothering Tithe", "1/1 white Soldier: Raise the Alarm", "2/2 black Zombie: Grave Titan", "Copy of a permanent: Helm of the Host"],
  );
});
