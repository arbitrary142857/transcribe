import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADJECTIVES,
  BARE_TRIES,
  NOUNS,
  drawLimit,
  mintNames,
  randomBelow,
} from "../dist/shared/names.js";
import { USERNAME, usernameProblem } from "../dist/shared/session.js";

/** Always the same choice, so a test can say which names it expects. */
const first = () => 0;
const last = (n: number) => n - 1;

describe("mintNames()", () => {
  it("offers plain pairs first, one for every bare try", () => {
    const plan = mintNames(first);
    assert.equal(plan.length, BARE_TRIES + 2);
    for (const name of plan.slice(0, BARE_TRIES)) {
      assert.equal(name, `${ADJECTIVES[0]}-${NOUNS[0]}`);
    }
  });

  it("hangs both numbers on the last pair it drew, not on a fresh one", () => {
    // The suffixes exist to rescue a pair the database has just refused, so
    // they have to be that pair's.
    const drawn: string[] = [];
    let call = 0;
    const plan = mintNames((n) => {
      // A different pair each time round, so "the last one" is visible.
      const at = Math.floor(call++ / 2) % n;
      return at;
    });
    for (const name of plan) drawn.push(name.split("-").slice(0, 2).join("-"));
    assert.equal(new Set(drawn.slice(BARE_TRIES)).size, 1);
    assert.equal(drawn.at(-1), drawn[BARE_TRIES - 1]);
  });

  it("numbers the last pair with three digits and then with four", () => {
    const plan = mintNames(first);
    const pair = `${ADJECTIVES[0]}-${NOUNS[0]}`;
    assert.equal(plan.at(-2), `${pair}-100`);
    assert.equal(plan.at(-1), `${pair}-1000`);
  });

  it("never reaches for a digit outside those widths", () => {
    const high = mintNames(last);
    const pair = `${ADJECTIVES.at(-1)}-${NOUNS.at(-1)}`;
    assert.equal(high.at(-2), `${pair}-999`);
    assert.equal(high.at(-1), `${pair}-9999`);
  });

  it("mints only names a person could have chosen", () => {
    for (const name of [...mintNames(first), ...mintNames(last)]) {
      assert.equal(usernameProblem(name), undefined, `would refuse ${name}`);
    }
  });
});

describe("the word lists", () => {
  const words = [...ADJECTIVES, ...NOUNS];

  it("holds every word to three characters and to nine", () => {
    // The budget the whole scheme rests on: nine and nine and four digits and
    // three hyphens is exactly the cap. A tenth character breaks it, and it
    // would break it quietly, in one name out of thousands.
    for (const word of words) {
      assert.ok(
        word.length >= 3 && word.length <= 9,
        `${word} is ${word.length} characters`,
      );
    }
  });

  it("spends the whole budget and no more", () => {
    const longest = (list: readonly string[]) =>
      list.reduce((most, word) => Math.max(most, word.length), 0);
    assert.equal(longest(ADJECTIVES) + 1 + longest(NOUNS) + 1 + 4, USERNAME.max);
  });

  it("is lowercase, unaccented and free of anything but letters and digits", () => {
    for (const word of words) {
      assert.match(word, /^[a-z0-9-]+$/u, `${word} is not in the charset`);
    }
  });

  it("says nothing twice", () => {
    assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length);
    assert.equal(new Set(NOUNS).size, NOUNS.length);
  });

  it("draws from lists worth drawing from", () => {
    assert.ok(ADJECTIVES.length >= 60);
    assert.ok(NOUNS.length >= 60);
  });
});

/**
 * Words no minted name may make, checked against every pair there is.
 *
 * They live in the test rather than in `src/`, so that nothing ships a list
 * of slurs, and the check is the reason: it is a thing to run once over the
 * whole product, not a thing the running site ever asks.
 *
 * Only what the *join* makes counts. A word that is already inside one half
 * is shown by the hyphen and read as itself — `adagio-bassline` is a bass
 * line — and treating those as hits would demand dropping `bassline`,
 * `partita`, `sextet`, `spiccato`, `brassy` and `tuneful` for containing
 * "ass", "tit", "sex" and "tune". What the hyphen cannot show is a word made
 * where two innocent halves meet, and that is what this looks for.
 */
const RESERVED = [
  "api", "play", "edit", "mine", "account", "about", "privacy", "auth",
  "anonymous", "admin", "transcribe", "tune", "tunes", "progress",
];

const RUDE = [
  "anal", "anus", "arse", "ass", "bastard", "bitch", "boob", "clit", "cock",
  "coon", "crap", "cum", "cunt", "damn", "dick", "dildo", "dyke", "fag",
  "fart", "fuck", "gook", "hell", "homo", "jap", "jizz", "kike", "kkk",
  "nigg", "paki", "penis", "piss", "poop", "porn", "prick", "pube", "puss",
  "queer", "rape", "rectum", "retard", "screw", "semen", "sex", "shit",
  "slut", "spic", "suck", "tit", "turd", "twat", "vagina", "wank", "whore",
  "wop",
];

describe("every pair there is", () => {
  it("makes nothing at the join that neither word says on its own", () => {
    const made: string[] = [];
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        const flat = adjective + noun;
        for (const word of [...RESERVED, ...RUDE]) {
          if (flat.includes(word) && !adjective.includes(word) && !noun.includes(word)) {
            made.push(`${adjective}-${noun} makes "${word}"`);
          }
        }
      }
    }
    // The fix for a hit is dropping a word from a list, never excusing a pair
    // here: `sonorous`, `tremulous` and `mellow` came out for exactly this.
    assert.deepEqual(made, []);
  });

  it("would refuse none of them, numbered or plain", () => {
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        const pair = `${adjective}-${noun}`;
        assert.equal(usernameProblem(pair), undefined, `would refuse ${pair}`);
        assert.equal(
          usernameProblem(`${pair}-9999`),
          undefined,
          `would refuse ${pair}-9999`,
        );
      }
    }
  });
});

describe("drawLimit()", () => {
  it("is the largest whole number of draws that fits the range", () => {
    // Everything at or above it is thrown away, which is what makes the
    // remainder even: 2^32 is not a multiple of 93, and a bare modulo would
    // hand the first few words more of the range than the rest.
    for (const n of [93, 133, 900, 9000]) {
      const limit = drawLimit(n);
      assert.equal(limit % n, 0, `${limit} is not a whole number of ${n}s`);
      assert.ok(2 ** 32 - limit < n, `${n} throws away too much`);
    }
  });

  it("throws nothing away for a power of two", () => {
    assert.equal(drawLimit(2 ** 8), 2 ** 32);
  });
});

describe("randomBelow()", () => {
  it("answers a whole number below the one it is given", () => {
    for (let each = 0; each < 500; each++) {
      const drawn = randomBelow(93);
      assert.ok(Number.isInteger(drawn) && drawn >= 0 && drawn < 93);
    }
  });

  it("reaches both ends of the range", () => {
    // Not a test of uniformity, which no test can be: only that nothing is
    // structurally out of reach.
    const seen = new Set<number>();
    for (let each = 0; each < 4000; each++) seen.add(randomBelow(7));
    assert.equal(seen.size, 7);
  });
});
