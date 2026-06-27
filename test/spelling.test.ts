import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Duration, NoteValue } from "../dist/music/duration.js";
import { KeySignature } from "../dist/music/key-signature.js";
import { Melody } from "../dist/music/melody.js";
import { Note, Rest } from "../dist/music/note-event.js";
import { Pitch } from "../dist/music/pitch.js";
import {
  alterationInEffect,
  enharmonicSpellings,
  requiresAccidental,
  spellForMelodyEvent,
  spellMidi,
  spellingContext,
} from "../dist/music/spelling.js";

const major = (letter: "C" | "A" | "E" | "D", accidental: -1 | 0 | 1) =>
  new KeySignature(new Pitch(letter, accidental, 4), "major");

const C_MAJOR = major("C", 0);
const A_FLAT_MAJOR = major("A", -1);
const E_MAJOR = major("E", 0);
const D_FLAT_MAJOR = major("D", -1);

const QUARTER = new Duration(NoteValue.Quarter);
const HALF = new Duration(NoteValue.Half);

/** Spelling strings of `pitches`, for readable assertions. */
const spell = (pitches: Pitch[]) => pitches.map((p) => p.toString());

/**
 * C major, two bars, with an E-flat early in bar 1 and a G tied across the
 * barline: bar 1 is `Eb4 C4 G4~`, bar 2 is `G4 C4`.
 */
function tiedAcrossBarline(): Melody {
  const melody = new Melody(C_MAJOR, { beats: 4, beatUnit: 4 }, [
    new Note(new Pitch("E", -1, 4), QUARTER),
    new Note(new Pitch("C", 0, 4), QUARTER),
    new Note(new Pitch("G", 0, 4), HALF),
    new Note(new Pitch("G", 0, 4), HALF),
    new Note(new Pitch("C", 0, 4), HALF),
  ]);
  melody.tie(2);
  return melody;
}

describe("Spelling", () => {
  it("alterationInEffect(): falls back to the key signature", () => {
    const context = spellingContext(A_FLAT_MAJOR, []);

    assert.equal(alterationInEffect(context, "B", 4), -1);
    assert.equal(alterationInEffect(context, "E", 4), -1);
    assert.equal(alterationInEffect(context, "G", 4), 0);
    assert.equal(alterationInEffect(context, "C", 4), 0);
  });

  it("alterationInEffect(): an earlier note overrides the key signature", () => {
    const context = spellingContext(A_FLAT_MAJOR, [
      new Note(new Pitch("B", 0, 4), QUARTER),
    ]);

    assert.equal(alterationInEffect(context, "B", 4), 0);
  });

  it("alterationInEffect(): the last note of a letter wins, not the first", () => {
    const context = spellingContext(C_MAJOR, [
      new Note(new Pitch("F", 1, 4), QUARTER),
      new Note(new Pitch("F", 0, 4), QUARTER),
    ]);

    assert.equal(alterationInEffect(context, "F", 4), 0);
  });

  it("alterationInEffect(): tracks each octave separately", () => {
    const context = spellingContext(C_MAJOR, [
      new Note(new Pitch("F", 1, 4), QUARTER),
    ]);

    assert.equal(alterationInEffect(context, "F", 4), 1);
    assert.equal(alterationInEffect(context, "F", 5), 0);
  });

  it("spellingContext(): ignores rests", () => {
    const context = spellingContext(C_MAJOR, [
      new Note(new Pitch("F", 1, 4), QUARTER),
      new Rest(QUARTER),
    ]);

    assert.equal(alterationInEffect(context, "F", 4), 1);
  });

  it("requiresAccidental(): compares against what is in effect", () => {
    const context = spellingContext(A_FLAT_MAJOR, []);

    // The key already flats B, so writing B-flat prints nothing.
    assert.equal(requiresAccidental(context, new Pitch("B", -1, 4)), false);
    assert.equal(requiresAccidental(context, new Pitch("B", 0, 4)), true);
    assert.equal(requiresAccidental(context, new Pitch("G", 0, 4)), false);
    assert.equal(requiresAccidental(context, new Pitch("G", -1, 4)), true);
  });

  it("enharmonicSpellings(): every spelling of a natural, in letter order", () => {
    // Semitone 48 is C4.
    assert.deepEqual(spell(enharmonicSpellings(48)), ["c4", "dbb4", "b#3"]);
  });

  it("enharmonicSpellings(): every spelling of a black key", () => {
    // Semitone 54 is F#4 / Gb4.
    assert.deepEqual(spell(enharmonicSpellings(54)), ["e##4", "f#4", "gb4"]);
  });

  it("enharmonicSpellings(): crosses the octave on the letter, not the sound", () => {
    // Semitone 47 sounds as B3, but spelling it with a C makes it Cb4.
    assert.deepEqual(spell(enharmonicSpellings(47, 1)), ["cb4", "b3"]);
  });

  it("enharmonicSpellings(): maxAccidental excludes double accidentals", () => {
    assert.deepEqual(spell(enharmonicSpellings(54, 1)), ["f#4", "gb4"]);
    assert.deepEqual(spell(enharmonicSpellings(48, 1)), ["c4", "b#3"]);
  });

  it("enharmonicSpellings(): every spelling sounds the requested semitone", () => {
    for (let semitone = 36; semitone < 60; semitone++) {
      for (const pitch of enharmonicSpellings(semitone)) {
        assert.equal(pitch.toSemitone(), semitone);
      }
    }
  });

  it("spellMidi(): preserves the sounding pitch in every key", () => {
    for (const key of [C_MAJOR, A_FLAT_MAJOR, E_MAJOR, D_FLAT_MAJOR]) {
      const context = spellingContext(key, []);
      for (let midi = 48; midi < 84; midi++) {
        assert.equal(spellMidi(midi, context).toMidi(), midi);
      }
    }
  });

  it("spellMidi(): a B natural in A-flat major stays a B natural", () => {
    // The key flats B, so this prints a natural sign — but C-flat would print a
    // flat for the same cost, and A-double-sharp is worse still. Plain B wins.
    const context = spellingContext(A_FLAT_MAJOR, []);
    assert.equal(spellMidi(71, context).toString(), "b4");
  });

  it("spellMidi(): spells the same sound to suit the key", () => {
    // E major already sharpens F, so F-sharp prints nothing and G-flat would.
    assert.equal(spellMidi(66, spellingContext(E_MAJOR, [])).toString(), "f#4");
    // D-flat major already flattens G, so it comes out the other way round.
    assert.equal(
      spellMidi(66, spellingContext(D_FLAT_MAJOR, [])).toString(),
      "gb4",
    );
  });

  it("spellMidi(): breaks a tie towards the key's own direction", () => {
    // Neither spelling is free in C major or A-flat major, so the sharp key
    // takes the sharp and the flat key takes the flat.
    assert.equal(spellMidi(66, spellingContext(C_MAJOR, [])).toString(), "f#4");
    assert.equal(
      spellMidi(66, spellingContext(A_FLAT_MAJOR, [])).toString(),
      "gb4",
    );
  });

  it("spellMidi(): prefers the spelling the key signature already covers", () => {
    const context = spellingContext(A_FLAT_MAJOR, []);
    assert.equal(spellMidi(70, context).toString(), "bb4");
  });

  it("spellMidi(): prefers what an earlier accidental already covers", () => {
    // An E-flat earlier in the bar makes a second E-flat free, while D-sharp
    // would print. Only reading back over the measure gets this right.
    const context = spellingContext(C_MAJOR, [
      new Note(new Pitch("E", -1, 4), QUARTER),
    ]);

    assert.equal(spellMidi(63, context).toString(), "eb4");
  });

  it("spellMidi(): without that context the same pitch spells as a sharp", () => {
    const context = spellingContext(C_MAJOR, []);
    assert.equal(spellMidi(63, context).toString(), "d#4");
  });

  it("spellMidi(): never takes a double accidental to break a tie", () => {
    const context = spellingContext(C_MAJOR, []);
    for (let midi = 48; midi < 84; midi++) {
      const pitch = spellMidi(midi, context);
      assert.ok(Math.abs(pitch.accidental) <= 1, `midi ${midi} spelled ${pitch}`);
    }
  });

  it("spellMidi(): spells a natural as a natural when nothing is in the way", () => {
    const context = spellingContext(C_MAJOR, []);
    assert.equal(spellMidi(60, context).toString(), "c4");
    assert.equal(spellMidi(67, context).toString(), "g4");
  });

  it("spellMidi(): returns a fresh Pitch each call", () => {
    const context = spellingContext(C_MAJOR, []);
    assert.notEqual(spellMidi(60, context), spellMidi(60, context));
  });

  it("spellForMelodyEvent(): reads back over the measure holding the note", () => {
    const melody = tiedAcrossBarline();
    assert.equal(spellForMelodyEvent(melody, 1, 63).toString(), "eb4");
  });

  it("spellForMelodyEvent(): spells a tied group against its first measure", () => {
    const melody = tiedAcrossBarline();

    // Index 3 sits in bar 2, which has no accidental of its own — but the tied
    // group starts at index 2 in bar 1, where the E-flat is still in effect.
    // Spelling against bar 2 instead would wrongly give d#4.
    assert.deepEqual(melody.getTiedGroup(3), [2, 3]);
    assert.equal(spellForMelodyEvent(melody, 3, 63).toString(), "eb4");
  });

  it("spellForMelodyEvent(): accidentals do not leak across a barline", () => {
    const melody = tiedAcrossBarline();

    // Index 4 is in bar 2, after the tied G. Bar 1's E-flat is long gone.
    assert.equal(spellForMelodyEvent(melody, 4, 63).toString(), "d#4");
  });

  it("spellForMelodyEvent(): produces a pitch setPitch accepts", () => {
    const melody = tiedAcrossBarline();
    melody.setPitch(3, spellForMelodyEvent(melody, 3, 63));

    const first = melody.getEvent(2);
    const second = melody.getEvent(3);
    assert.ok(first instanceof Note && second instanceof Note);
    assert.equal(first.pitch.toString(), "eb4");
    assert.equal(second.pitch.toString(), "eb4");
  });
});
