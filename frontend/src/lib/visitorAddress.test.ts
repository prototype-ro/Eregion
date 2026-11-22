import assert from "node:assert/strict";
import { test } from "node:test";
import { visitorAddress } from "./visitorAddress.ts";

test("the host's x-real-ip names the visitor", () => {
  assert.equal(visitorAddress(new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.1" })), "198.51.100.7");
});

test("without x-real-ip, the first x-forwarded-for entry is the visitor", () => {
  assert.equal(visitorAddress(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.2" })), "198.51.100.7");
});

test("no address headers gives no address", () => {
  assert.equal(visitorAddress(new Headers()), null);
  assert.equal(visitorAddress(new Headers({ "x-forwarded-for": " " })), null);
});
