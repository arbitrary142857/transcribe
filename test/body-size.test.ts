/**
 * How much one caller may send.
 *
 * The rule used to be `text.length`, which counts UTF-16 units: a body of
 * three-byte characters was three times the budget it was held to, and the
 * whole of it had been read into memory before anything counted it. Both
 * halves of that are what these tests are about.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyTextOf, byteLengthOf } from "../dist-worker/worker/limits.js";

/** A body that declares its own size, as a browser's fetch always does. */
const sent = (text: string, declared = new TextEncoder().encode(text).byteLength) =>
  new Request("https://example.test/api/tunes", {
    method: "POST",
    headers: { "content-length": String(declared) },
    body: text,
  });

/** One with no Content-Length at all, which is what a chunked sender is. */
const streamed = (text: string) => {
  const request = new Request("https://example.test/api/tunes", {
    method: "POST",
    body: text,
  });
  // Whatever the runtime put there, this stands in for a sender that said
  // nothing about its size.
  return {
    headers: { get: () => null },
    text: () => request.text(),
  };
};

describe("byteLengthOf", () => {
  it("counts a plain ASCII string as its own length", () => {
    assert.equal(byteLengthOf("hello"), 5);
  });

  it("counts a character that takes three bytes as three", () => {
    // U+4E2D, one UTF-16 unit and three UTF-8 bytes.
    assert.equal("中".length, 1);
    assert.equal(byteLengthOf("中"), 3);
  });

  it("counts an astral character as four, though it is two units", () => {
    assert.equal("🎵".length, 2);
    assert.equal(byteLengthOf("🎵"), 4);
  });
});

describe("bodyTextOf", () => {
  it("hands back a body that fits", async () => {
    assert.equal(await bodyTextOf(sent("{}"), 1024), "{}");
  });

  it("refuses one that fits in UTF-16 units but not in bytes", async () => {
    // Ten characters, ten UTF-16 units, thirty bytes. The old rule let this
    // through against a budget of twenty.
    const body = "中".repeat(10);
    assert.equal(body.length, 10);
    assert.equal(await bodyTextOf(sent(body), 20), undefined);
  });

  it("takes the same body against a budget that really does hold it", async () => {
    const body = "中".repeat(10);
    assert.equal(await bodyTextOf(sent(body), 30), body);
  });

  it("refuses on the declared size without reading the body at all", async () => {
    let read = false;
    const request = {
      headers: { get: (name: string) => (name === "content-length" ? "999999" : null) },
      text: async () => {
        read = true;
        return "{}";
      },
    };
    assert.equal(await bodyTextOf(request, 1024), undefined);
    assert.equal(read, false, "the body was read despite the header saying not to");
  });

  it("still counts for itself when nothing was declared, since a header is the sender's", async () => {
    assert.equal(await bodyTextOf(streamed("中".repeat(10)), 20), undefined);
    assert.equal(await bodyTextOf(streamed("ok"), 20), "ok");
  });

  it("takes a body of exactly the budget, which is a limit rather than a fence", async () => {
    assert.equal(await bodyTextOf(sent("abcde"), 5), "abcde");
    assert.equal(await bodyTextOf(sent("abcdef"), 5), undefined);
  });
});
