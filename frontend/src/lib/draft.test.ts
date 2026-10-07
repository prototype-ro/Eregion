import assert from "node:assert/strict";
import { test } from "node:test";
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from "./draft.ts";
import type { DeckCardLine } from "./types";

class FakeStore {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

const lines = [{ cardId: "a", name: "Sol Ring", board: "main", quantity: 1 }] as unknown as DeckCardLine[];

test("a saved draft comes back", () => {
  const store = new FakeStore();
  saveDraft("d1", 3, "sig", lines, store, 1000);

  assert.deepEqual(loadDraft("d1", 3, "sig", store), { lines, baseSignature: "sig", savedAt: 1000 });
});

test("drafts are per deck and per version", () => {
  const store = new FakeStore();
  saveDraft("d1", 3, "sig", lines, store);

  assert.equal(loadDraft("d1", 4, "sig", store), null);
  assert.equal(loadDraft("d2", 3, "sig", store), null);
});

test("a draft from an older state of the version is dropped", () => {
  const store = new FakeStore();
  saveDraft("d1", 3, "old", lines, store);

  assert.equal(loadDraft("d1", 3, "new", store), null);
});

test("damaged or empty drafts are ignored", () => {
  const store = new FakeStore();
  store.setItem("eregion-draft:d1:1", "{not json");
  store.setItem("eregion-draft:d1:2", JSON.stringify({ lines: [], baseSignature: "s", savedAt: 1 }));
  store.setItem("eregion-draft:d1:3", JSON.stringify({ lines: "x", baseSignature: "s", savedAt: 1 }));

  assert.equal(loadDraft("d1", 1, "s", store), null);
  assert.equal(loadDraft("d1", 2, "s", store), null);
  assert.equal(loadDraft("d1", 3, "s", store), null);
});

test("clearing removes one draft only", () => {
  const store = new FakeStore();
  saveDraft("d1", 1, "s", lines, store);
  saveDraft("d1", 2, "s", lines, store);
  clearDraft("d1", 1, store);

  assert.equal(loadDraft("d1", 1, "s", store), null);
  assert.notEqual(loadDraft("d1", 2, "s", store), null);
});

test("clearing all removes drafts and leaves other keys", () => {
  const store = new FakeStore();
  saveDraft("d1", 1, "s", lines, store);
  saveDraft("d2", 5, "s", lines, store);
  store.setItem("eregion-theme", "dark");
  clearAllDrafts(store);

  assert.equal(store.length, 1);
  assert.equal(store.getItem("eregion-theme"), "dark");
});

test("storage that throws or is missing never breaks anything", () => {
  const broken = { length: 0, key: () => null, getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };

  assert.doesNotThrow(() => saveDraft("d", 1, "s", lines, broken));
  assert.equal(loadDraft("d", 1, "s", broken), null);
  assert.doesNotThrow(() => clearDraft("d", 1, broken));
  assert.doesNotThrow(() => clearAllDrafts(broken));
  assert.doesNotThrow(() => saveDraft("d", 1, "s", lines, null));
  assert.equal(loadDraft("d", 1, "s", null), null);
});
