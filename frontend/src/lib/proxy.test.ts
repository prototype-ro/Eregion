import assert from "node:assert/strict";
import { test } from "node:test";
import { fullPrompt, pending, runBatch } from "./proxy.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("runs every item and reports none failed", async () => {
  const seen: number[] = [];
  const result = await runBatch([1, 2, 3, 4], async (n) => void seen.push(n), { concurrency: 2, signal: new AbortController().signal });

  assert.deepEqual(seen.sort(), [1, 2, 3, 4]);
  assert.equal(result.done, 4);
  assert.deepEqual(result.failed, []);
});

test("never has more than the concurrency running at once", async () => {
  let running = 0;
  let peak = 0;
  await runBatch([1, 2, 3, 4, 5, 6], async () => {
    running++;
    peak = Math.max(peak, running);
    await tick();
    running--;
  }, { concurrency: 3, signal: new AbortController().signal });

  assert.equal(peak, 3);
});

test("one failure does not stop the others", async () => {
  const result = await runBatch([1, 2, 3], async (n) => {
    if (n === 2) throw new Error("boom");
  }, { concurrency: 1, signal: new AbortController().signal });

  assert.equal(result.done, 2);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].item, 2);
});

test("cancelling stops starting new items", async () => {
  const controller = new AbortController();
  const seen: number[] = [];
  const result = await runBatch([1, 2, 3, 4], async (n) => {
    seen.push(n);
    if (n === 2) controller.abort();
    await tick();
  }, { concurrency: 1, signal: controller.signal });

  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.done, 2);
});

test("progress is reported after each item", async () => {
  const marks: number[] = [];
  await runBatch([1, 2, 3], async () => {}, { concurrency: 1, signal: new AbortController().signal, onProgress: (finished) => marks.push(finished) });

  assert.deepEqual(marks, [1, 2, 3]);
});

test("pending lists the cards that have no treatment yet", () => {
  assert.deepEqual(pending(["a", "b", "c"], [{ cardId: "b" }]), ["a", "c"]);
});

test("the copied prompt carries the deck's parameters", () => {
  assert.equal(fullPrompt("a tall figure", "--ar 5:7 --v 7"), "a tall figure --ar 5:7 --v 7");
  assert.equal(fullPrompt("a tall figure", null), "a tall figure");
  assert.equal(fullPrompt("a tall figure", "  "), "a tall figure");
});
