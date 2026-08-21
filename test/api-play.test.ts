import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decode, encode, parseMelodyJson } from "../dist/editor/codec.js";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, type NoteEvent, Rest, UnpitchedNote } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import { api } from "../dist-worker/worker/routes.js";
import { SIGNED_IN, asAdmin, asOwner, asStranger } from "./helpers/signed-in.js";
import {
  errorOf,
  stubDatabase,
  type Answer,
  type Row,
} from "./helpers/stub-database.js";

const C4 = new Pitch("C", 0, 4);
const E4 = new Pitch("E", 0, 4);
const G4 = new Pitch("G", 0, 4);
const QUARTER = new Duration(NoteValue.Quarter);
const C_MAJOR = new KeySignature(new Pitch("C", 0, 4), "major");
const METER_4_4 = { beats: 4, beatUnit: 4 } as const;

const melodyOf = (events: readonly NoteEvent[]) =>
  new Melody(C_MAJOR, METER_4_4, events);

/**
 * Three different pitches, deliberately.
 *
 * A fixture of one repeated pitch would pass a leak test that a real melody
 * fails: with every note the same, a route that handed the answer over would
 * look identical to one that gave away only the first.
 */
const ANSWER = melodyOf([
  new Note(C4, QUARTER),
  new Note(E4, QUARTER),
  new Note(G4, QUARTER),
  new Note(E4, QUARTER),
]);

const ID = "k3m9x2p7qw4t";

/** A row exactly as the migration shapes one, with the answer in it. */
const rowOf = (over: Row = {}): Row => ({
  id: ID,
  title: "Clair de lune",
  subtitle: "Debussy",
  instructions: "The opening phrase.",
  video_id: "dQw4w9WgXcQ",
  mark_start: 12.5,
  mark_end: 14.5,
  measures: 1,
  clef: "treble",
  meter_beats: 4,
  meter_unit: 4,
  key_fifths: 0,
  key_mode: "major",
  note_count: 4,
  unpitched_count: 0,
  melody: JSON.stringify(encode(ANSWER)),
  owner_id: "7k2m9x4p3qwt",
  status: "published",
  published_at: 1_754_500_000_000,
  updated_at: 1_754_500_000_000,
  created_at: 1_754_500_000_000,
  ...over,
});

/** The level the statement that reads levels would find, if any. */
const stored = (row: Row | undefined, more: readonly Answer[]): Answer[] => [
  ...(row ? [{ when: /FROM transcriptions/iu, first: row }] : []),
  ...more,
];

const get = async (
  path: string,
  row?: Row,
  more: readonly Answer[] = [],
  headers: Record<string, string> = {},
) => {
  const { asked, env } = stubDatabase(stored(row, more));
  const response = await api.request(path, { headers }, env);
  return { response, asked };
};

const post = async (
  path: string,
  body: unknown,
  row?: Row,
  more: readonly Answer[] = [],
  headers: Record<string, string> = {},
) => {
  const { asked, env } = stubDatabase(stored(row, more));
  const response = await api.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env,
  );
  return { response, asked };
};

/** The attempt a player who heard it correctly would send. */
const rightAnswer = [
  { index: 0, midi: C4.toMidi() },
  { index: 1, midi: E4.toMidi() },
  { index: 2, midi: G4.toMidi() },
  { index: 3, midi: E4.toMidi() },
];

describe("GET /api/levels/:id/puzzle", () => {
  it("hands over the rhythm with only the first note's pitch on it", async () => {
    const { response } = await get(`/api/levels/${ID}/puzzle`, rowOf());

    assert.equal(response.status, 200);
    const body = (await response.json()) as { melody: unknown };
    const puzzle = decode(parseMelodyJson(body.melody)!);

    assert.ok(puzzle.getEvent(0) instanceof Note);
    for (const index of [1, 2, 3]) {
      assert.ok(
        puzzle.getEvent(index) instanceof UnpitchedNote,
        `event ${index} still carries its pitch`,
      );
    }
  });

  it("mentions no pitch of the answer anywhere in what it sends", async () => {
    // Asserted over the whole response text rather than over the melody field,
    // because the point is that the answer is nowhere in the reply at all --
    // not merely absent from the place one would think to look.
    const { response } = await get(`/api/levels/${ID}/puzzle`, rowOf());
    const text = await response.text();

    // C may appear: it is the key's tonic and the given note. E and G are the
    // answer, and appear nowhere.
    const pitches = text.match(/"letter":"[A-G]"/g) ?? [];
    assert.deepEqual([...new Set(pitches)], ['"letter":"C"']);
  });

  it("gives away a tied opening run whole, so the puzzle still decodes", async () => {
    // Melody.tie() refuses to join a pitched note to an unpitched one, so half
    // a run would reach the page as a melody that throws on the way in.
    const tied = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
      new Note(G4, QUARTER),
    ]);
    tied.tie(0);

    const { response } = await get(
      `/api/levels/${ID}/puzzle`,
      rowOf({ melody: JSON.stringify(encode(tied)), note_count: 3 }),
    );

    const body = (await response.json()) as { melody: unknown };
    const parsed = parseMelodyJson(body.melody);
    assert.notEqual(parsed, undefined);
    assert.doesNotThrow(() => decode(parsed!));

    const puzzle = decode(parsed!);
    assert.ok(puzzle.getEvent(0) instanceof Note);
    assert.ok(puzzle.getEvent(1) instanceof Note);
    assert.ok(puzzle.getEvent(2) instanceof UnpitchedNote);
  });

  it("carries the facts a play page draws its bar from", async () => {
    const { response } = await get(`/api/levels/${ID}/puzzle`, rowOf());

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.title, "Clair de lune");
    assert.equal(body.subtitle, "Debussy");
    assert.equal(body.videoId, "dQw4w9WgXcQ");
    assert.equal(body.markStart, 12.5);
    assert.equal(body.markEnd, 14.5);
    assert.equal(body.clef, "treble");
    assert.equal(body.keyMode, "major");
    assert.deepEqual(body.meter, { beats: 4, beatUnit: 4 });
  });

  it("refuses a transcription still missing pitches, which cannot mark anyone", async () => {
    const draft = melodyOf([new Note(C4, QUARTER), new UnpitchedNote(QUARTER)]);

    const { response } = await get(
      `/api/levels/${ID}/puzzle`,
      rowOf({ melody: JSON.stringify(encode(draft)), unpitched_count: 1 }),
    );

    assert.equal(response.status, 409);
    assert.match(await errorOf(response), /finished/i);
  });

  it("looks nothing up for an id that could not name a level", async () => {
    const { response, asked } = await get("/api/levels/NOT-AN-ID/puzzle");

    assert.equal(response.status, 404);
    assert.equal(asked.length, 0);
  });

  it("answers 404 for a level that is not there", async () => {
    const { response } = await get(`/api/levels/${ID}/puzzle`);

    assert.equal(response.status, 404);
  });

  describe("when the level is a draft", () => {
    const draft = rowOf({ status: "draft", published_at: null });

    it("still hands a published puzzle to anybody, without asking who they are", async () => {
      const { response, asked } = await get(`/api/levels/${ID}/puzzle`, rowOf(), [asOwner()], SIGNED_IN);

      assert.equal(response.status, 200);
      assert.equal(asked.length, 1);
      assert.doesNotMatch(asked[0]!.sql, /sessions/i);
    });

    it("hands a draft's puzzle to its author, and to an admin", async () => {
      for (const who of [asOwner(), asAdmin()]) {
        const { response } = await get(`/api/levels/${ID}/puzzle`, draft, [who], SIGNED_IN);
        assert.equal(response.status, 200);
      }
    });

    it("hides a draft from a stranger and from the signed-out alike, as 404", async () => {
      const stranger = await get(`/api/levels/${ID}/puzzle`, draft, [asStranger()], SIGNED_IN);
      assert.equal(stranger.response.status, 404);
      assert.equal(await errorOf(stranger.response), "There is no level at that address.");

      const nobody = await get(`/api/levels/${ID}/puzzle`, draft);
      assert.equal(nobody.response.status, 404);
    });

    it("asks who is asking only after the row turns out to be a draft", async () => {
      const { asked } = await get(`/api/levels/${ID}/puzzle`, draft, [asOwner()], SIGNED_IN);

      assert.equal(asked.length, 2);
      assert.match(asked[0]!.sql, /from transcriptions/i);
      assert.match(asked[1]!.sql, /from sessions/i);
    });
  });
});

describe("POST /api/levels/:id/check", () => {
  it("marks every note and says the puzzle is solved", async () => {
    const { response } = await post(
      `/api/levels/${ID}/check`,
      { pitches: rightAnswer },
      rowOf(),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      verdicts: { index: number; correct: boolean }[];
      correct: number;
      total: number;
      solved: boolean;
    };
    assert.equal(body.solved, true);
    assert.equal(body.correct, 4);
    assert.equal(body.total, 4);
    assert.deepEqual(
      body.verdicts,
      [0, 1, 2, 3].map((index) => ({ index, correct: true })),
    );
  });

  it("marks the wrong ones wrong and does not call it solved", async () => {
    const { response } = await post(
      `/api/levels/${ID}/check`,
      {
        pitches: [
          ...rightAnswer.slice(0, 2),
          { index: 2, midi: C4.toMidi() },
          rightAnswer[3]!,
        ],
      },
      rowOf(),
    );

    const body = (await response.json()) as {
      verdicts: { index: number; correct: boolean }[];
      correct: number;
      solved: boolean;
    };
    assert.equal(body.solved, false);
    assert.equal(body.correct, 3);
    assert.deepEqual(body.verdicts[2], { index: 2, correct: false });
  });

  it("says nothing about the answer, on the solved reply as much as any other", async () => {
    // The reply a solved player gets is the one most tempting to fill in with
    // the melody. It carries verdicts and counts, and nothing that is a pitch.
    for (const pitches of [rightAnswer, [{ index: 0, midi: 1 }, ...rightAnswer.slice(1)]]) {
      const { response } = await post(
        `/api/levels/${ID}/check`,
        { pitches },
        rowOf(),
      );
      const text = await response.text();

      assert.equal(/letter/i.test(text), false, text);
      assert.equal(/octave/i.test(text), false, text);
      assert.equal(/melody/i.test(text), false, text);
      const body = JSON.parse(text) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body).sort(), [
        "correct",
        "solved",
        "total",
        "verdicts",
      ]);
      for (const verdict of body.verdicts as Record<string, unknown>[]) {
        assert.deepEqual(Object.keys(verdict).sort(), ["correct", "index"]);
      }
    }
  });

  it("takes an enharmonic respelling, since nobody chooses a spelling", async () => {
    const sharp = melodyOf([
      new Note(C4, QUARTER),
      new Note(new Pitch("D", 1, 4), QUARTER),
    ]);

    const { response } = await post(
      `/api/levels/${ID}/check`,
      {
        pitches: [
          { index: 0, midi: C4.toMidi() },
          { index: 1, midi: new Pitch("E", -1, 4).toMidi() },
        ],
      },
      rowOf({ melody: JSON.stringify(encode(sharp)), note_count: 2 }),
    );

    const body = (await response.json()) as { solved: boolean };
    assert.equal(body.solved, true);
  });

  it("grades a tied run once, by its head", async () => {
    const tied = melodyOf([
      new Note(C4, QUARTER),
      new Note(C4, QUARTER),
      new Note(E4, QUARTER),
    ]);
    tied.tie(0);

    const { response } = await post(
      `/api/levels/${ID}/check`,
      {
        pitches: [
          { index: 0, midi: C4.toMidi() },
          { index: 2, midi: E4.toMidi() },
        ],
      },
      rowOf({ melody: JSON.stringify(encode(tied)), note_count: 2 }),
    );

    const body = (await response.json()) as {
      verdicts: { index: number }[];
      total: number;
      solved: boolean;
    };
    assert.deepEqual(
      body.verdicts.map((verdict) => verdict.index),
      [0, 2],
    );
    assert.equal(body.total, 2);
    assert.equal(body.solved, true);
  });

  it("refuses an attempt that has not filled every note in", async () => {
    // Partial attempts are the cheapest way to interrogate the marker, and a
    // half-filled score is not something anyone means to submit.
    const { response } = await post(
      `/api/levels/${ID}/check`,
      { pitches: rightAnswer.slice(0, 2) },
      rowOf(),
    );

    assert.equal(response.status, 400);
    assert.match(await errorOf(response), /every note|all/i);
  });

  it("refuses a transcription still missing pitches", async () => {
    const draft = melodyOf([new Note(C4, QUARTER), new UnpitchedNote(QUARTER)]);

    const { response } = await post(
      `/api/levels/${ID}/check`,
      { pitches: [{ index: 0, midi: C4.toMidi() }, { index: 1, midi: 60 }] },
      rowOf({ melody: JSON.stringify(encode(draft)), unpitched_count: 1 }),
    );

    assert.equal(response.status, 409);
  });

  it("refuses anything that is not an attempt", async () => {
    for (const body of [
      "not json",
      { pitches: "everything" },
      { pitches: [{ index: 0 }] },
      { pitches: [{ index: 0, midi: "C4" }] },
      { pitches: [{ index: 0.5, midi: 60 }] },
      { pitches: [{ index: -1, midi: 60 }] },
      { pitches: [{ index: 900, midi: 60 }] },
      { pitches: [{ index: 0, midi: 5000 }] },
      { pitches: [{ index: 0, midi: 60 }, { index: 0, midi: 61 }] },
      {},
    ]) {
      const { response } = await post(
        `/api/levels/${ID}/check`,
        body,
        rowOf(),
      );
      assert.equal(
        response.status,
        400,
        `accepted ${JSON.stringify(body)}`,
      );
    }
  });

  it("answers 404 for a level that is not there", async () => {
    const { response } = await post(
      `/api/levels/${ID}/check`,
      { pitches: rightAnswer },
    );

    assert.equal(response.status, 404);
  });

  it("looks nothing up for an id that could not name a level", async () => {
    const { response, asked } = await post("/api/levels/NOT-AN-ID/check", {
      pitches: rightAnswer,
    });

    assert.equal(response.status, 404);
    assert.equal(asked.length, 0);
  });

  it("marks a published level's attempt for anybody, with no session lookup", async () => {
    const { response, asked } = await post(
      `/api/levels/${ID}/check`,
      { pitches: rightAnswer },
      rowOf(),
      [asOwner()],
      SIGNED_IN,
    );

    assert.equal(response.status, 200);
    assert.equal(asked.length, 1);
  });

  it("lets the author try their own finished draft, and nobody else", async () => {
    const draft = rowOf({ status: "draft", published_at: null });

    const author = await post(`/api/levels/${ID}/check`, { pitches: rightAnswer }, draft, [asOwner()], SIGNED_IN);
    assert.equal(author.response.status, 200);
    assert.equal(((await author.response.json()) as { solved: boolean }).solved, true);

    const stranger = await post(`/api/levels/${ID}/check`, { pitches: rightAnswer }, draft, [asStranger()], SIGNED_IN);
    assert.equal(stranger.response.status, 404);

    const nobody = await post(`/api/levels/${ID}/check`, { pitches: rightAnswer }, draft);
    assert.equal(nobody.response.status, 404);
  });

  it("reads the attempt before the database, so a huge body is 413 whatever the level", async () => {
    const { response, asked } = await post(
      `/api/levels/${ID}/check`,
      { pitches: rightAnswer, padding: "a".repeat(100_000) },
      rowOf({ status: "draft", published_at: null }),
    );

    assert.equal(response.status, 413);
    assert.deepEqual(asked, []);
  });

  it("never grades a rest, which nobody was asked to find", async () => {
    const withRest = melodyOf([
      new Note(C4, QUARTER),
      new Rest(QUARTER),
      new Note(E4, QUARTER),
    ]);

    const { response } = await post(
      `/api/levels/${ID}/check`,
      {
        pitches: [
          { index: 0, midi: C4.toMidi() },
          { index: 2, midi: E4.toMidi() },
        ],
      },
      rowOf({ melody: JSON.stringify(encode(withRest)), note_count: 2 }),
    );

    const body = (await response.json()) as {
      verdicts: { index: number }[];
      solved: boolean;
    };
    assert.deepEqual(
      body.verdicts.map((verdict) => verdict.index),
      [0, 2],
    );
    assert.equal(body.solved, true);
  });
});
