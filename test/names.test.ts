import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADJECTIVES, NOUNS, mintName } from "../dist/shared/names.js";
import { usernameProblem } from "../dist/shared/session.js";

/** Always the same choice, so a test can say which name it expects. */
const first = () => 0;
const last = (n: number) => n - 1;

describe("mintName()", () => {
  it("joins an adjective and a noun with a hyphen", () => {
    assert.equal(mintName(first, 0), `${ADJECTIVES[0]}-${NOUNS[0]}`);
    assert.equal(mintName(last, 0), `${ADJECTIVES.at(-1)}-${NOUNS.at(-1)}`);
  });

  it("adds a number from the second attempt on, starting at two", () => {
    assert.equal(mintName(first, 1), `${ADJECTIVES[0]}-${NOUNS[0]}-2`);
    assert.equal(mintName(first, 5), `${ADJECTIVES[0]}-${NOUNS[0]}-6`);
  });

  it("asks for its two picks within the lists", () => {
    const asked: number[] = [];
    mintName((n) => {
      asked.push(n);
      return 0;
    }, 0);
    assert.deepEqual(asked, [ADJECTIVES.length, NOUNS.length]);
  });

  it("mints only names a person could have chosen", () => {
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        const name = `${adjective}-${noun}`;
        assert.equal(usernameProblem(name), undefined, `would refuse ${name}`);
        assert.equal(usernameProblem(`${name}-99`), undefined, `would refuse ${name}-99`);
      }
    }
  });

  it("draws from lists worth drawing from", () => {
    assert.ok(ADJECTIVES.length >= 60);
    assert.ok(NOUNS.length >= 60);
    assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length);
    assert.equal(new Set(NOUNS).size, NOUNS.length);
  });
});
