# Music ADTs

TypeScript abstract data types for representing multi-bar melodies. Core types import from `src/music/index.js`; measures and fractions import from their own modules (see below).

```typescript
import {
  Pitch,
  Duration,
  NoteValue,
  Tuplet,
  KeySignature,
  Note,
  Rest,
  Melody,
} from "./music/index.js";

import {
  Measure,
  splitIntoMeasures,
  MeasureOverflowError,
  IncompleteMeasureError,
  TupletAcrossBarlineError,
  UngroupedTupletError,
} from "./music/measure.js";

import { Fraction } from "./music/fraction.js";

import {
  spellingContext,
  spellForMelodyEvent,
  spellMidi,
  enharmonicSpellings,
} from "./music/spelling.js";
```

---

## Supporting types

These are plain types (not classes). They appear as fields on the ADTs below.

### `LetterName`

Natural pitch letter: `"C" | "D" | "E" | "F" | "G" | "A" | "B"`.

### `Accidental`

Semitone offset from the natural pitch:

| Value | Meaning      |
| ----- | ------------ |
| `-2`  | double-flat  |
| `-1`  | flat         |
| `0`   | natural      |
| `1`   | sharp        |
| `2`   | double-sharp |

### `Mode`

Key quality: `"major" | "minor"`.

### `TimeSignature`

Meter, stored as `{ beats, beatUnit }` (e.g. `{ beats: 4, beatUnit: 4 }` is 4/4). Immutable after a `Melody` is constructed.

---

## `Pitch`

A spelled pitch with octave. F♯ and G♭ are distinct objects; enharmonic equivalence is detected via methods, not `===`.

### Fields

| Field        | Type          | Description                    |
| ------------ | ------------- | ------------------------------ |
| `letter`     | `LetterName`  | Natural letter name            |
| `accidental` | `Accidental`  | Alteration from natural        |
| `octave`     | `number`      | Octave number (must be integer)|

### Constructor

```typescript
new Pitch(letter: LetterName, accidental: Accidental, octave: number)
```

Throws `TypeError` if `octave` is not an integer.

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `toSemitone()` | `number` | Absolute semitone index (C0 = 0). |
| `toMidi()` | `number` | MIDI note number (C4 = 60). |
| `toFrequency(a4Hz?)` | `number` | Frequency in Hz; default A4 = 440 Hz. |
| `toChroma()` | `number` | Pitch class 0–11 within the octave. |
| `isEqual(other)` | `boolean` | Exact match: same letter, accidental, and octave. |
| `isEnharmonicallyEqual(other)` | `boolean` | Same sounding height (e.g. F♯4 and G♭4). |
| `toString()` | `string` | Spelling string, e.g. `"A#4"`, `"Gb3"`. |

### Example

```typescript
const fSharp = new Pitch("F", 1, 4);
const gFlat = new Pitch("G", -1, 4);

fSharp.isEqual(gFlat);               // false
fSharp.isEnharmonicallyEqual(gFlat); // true
fSharp.toString();                   // "F#4"
```

---

## `NoteValue`

Named constants for **written** note shapes. Each numeric value is the **denominator of 1/n of a whole note** (e.g. `4` → quarter note → 1/4 of a whole). Every value is a power of two; performing a note faster or slower than written is a `Tuplet`, not a `NoteValue`.

### Constants

| Name | Value | Length (of whole) |
| ---- | ----- | ----------------- |
| `Whole` | 1 | 1/1 |
| `Half` | 2 | 1/2 |
| `Quarter` | 4 | 1/4 |
| `Eighth` | 8 | 1/8 |
| `Sixteenth` | 16 | 1/16 |
| `ThirtySecond` | 32 | 1/32 |

---

## `Tuplet`

A ratio applied to a written duration: `numNotes` notes played in the time of `inTimeOf` notes of the same written value. This mirrors VexFlow's `numNotes` / `notesOccupied` and prints the same way on a bracket.

### Fields

| Field       | Type     | Description                                 |
| ----------- | -------- | ------------------------------------------- |
| `numNotes`  | `number` | How many notes are written                  |
| `inTimeOf`  | `number` | How many they are performed in the time of  |

### Constructor

```typescript
new Tuplet(numNotes: number, inTimeOf: number)
```

Throws `RangeError` if either argument is not a positive integer.

### Constants

| Name | Ratio | Meaning |
| ---- | ----- | ------- |
| `Tuplet.None` | 1:1 | No tuplet — the written duration is unchanged |
| `Tuplet.Triplet` | 3:2 | Three notes in the time of two |
| `Tuplet.Quintuplet` | 5:4 | Five notes in the time of four |

`Tuplet.None` is the absence of a tuplet, so `Duration.tuplet` is never `null`.

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `isNone()` | `boolean` | Whether the ratio leaves the written duration unchanged (`numNotes === inTimeOf`). |
| `asFraction()` | `Fraction` | `inTimeOf / numNotes` — the factor applied to a written duration. |
| `isEqual(other)` | `boolean` | Same `numNotes` and `inTimeOf`. Not reduced first: 6:4 does not equal 3:2. |
| `toString()` | `string` | `"3:2"`, as VexFlow prints it on the bracket. |

### `TupletSpan`

A plain type (not a class) describing one bracket: `{ start: number; count: number; tuplet: Tuplet }`. Returned by `Melody.getTupletSpan` / `Melody.tupletSpans` (indices into the melody) and carried on `Measure.tuplets` (indices local to the measure).

---

## `Duration`

A notated note or rest length: a `NoteValue`, optional augmentation dots, and a `Tuplet` ratio.

### Fields

| Field    | Type        | Description                                    |
| -------- | ----------- | ---------------------------------------------- |
| `value`  | `NoteValue` | Written note length (see table above)          |
| `dots`   | `number`    | Number of augmentation dots (default 0)        |
| `tuplet` | `Tuplet`    | Performance ratio (default `Tuplet.None`)      |

### Constructor

```typescript
new Duration(value: NoteValue, dots?: number, tuplet?: Tuplet)
```

Throws `RangeError` if `dots` is negative or not an integer.

Each dot adds half of the **original** note value (one dot → ×3/2, two dots → ×7/4, etc.). The tuplet ratio is applied last, so a triplet eighth is `1/8 × 2/3 = 1/12` of a whole note.

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `isEqual(other)` | `boolean` | Same `value`, `dots`, and `tuplet` (exact notation). |
| `asWholeNoteFraction()` | `Fraction` | Sounding length as a reduced fraction of a whole note, tuplet ratio included. |
| `sameLengthAs(other)` | `boolean` | Same sounding length, possibly different notation. |
| `inSeconds(bpm)` | `number` | Wall-clock duration at the given quarter-note BPM. |
| `vexFlowToken()` | `string` | VexFlow duration token for the written value, e.g. `"q"` or `"16"`. Ignores dots and tuplets. |
| `toString()` | `string` | Written length and ratio, e.g. `"/q"`, `"/q.."`, `"/8{3:2}"`. |

`toString()` is a readable debug format, not a VexFlow input string. VexFlow's EasyScore grammar has no tuplet syntax at all — tuplets exist only as objects built alongside the notes — so no token could round-trip a tuplet. Rendering uses `vexFlowToken()` and the `Factory` API instead.

### Example

```typescript
new Duration(NoteValue.Quarter);                          // quarter note
new Duration(NoteValue.Quarter, 1);                       // dotted quarter
new Duration(NoteValue.Eighth, 0, Tuplet.Triplet);        // one eighth-note triplet
new Duration(NoteValue.Sixteenth, 0, Tuplet.Quintuplet);  // one sixteenth quintuplet
```

---

## `KeySignature`

The key of a melody. Immutable after a `Melody` is constructed.

### Fields

| Field   | Type     | Description                          |
| ------- | -------- | ------------------------------------ |
| `tonic` | `Pitch`  | Tonic pitch (octave included)        |
| `mode`  | `Mode`   | `"major"` or `"minor"`               |

### Constructor

```typescript
new KeySignature(tonic: Pitch, mode: Mode)
```

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `isEqual(other)` | `boolean` | Same mode and exact tonic spelling (including octave). |
| `isEnharmonicallyEqual(other)` | `boolean` | Same mode and enharmonically equivalent tonic (octave ignored via chroma). |
| `fifths()` | `number` | Position on the circle of fifths: positive counts sharps, negative flats. C major is 0, G major 1, A♭ major −4, C♯ major 7. |
| `alterationFor(letter)` | `Accidental` | The alteration this key applies to `letter`, in every octave. A♭ major returns −1 for B, E, A and D, and 0 for G, C and F. Throws `RangeError` for keys needing more than a double accidental, which only absurd tonics such as B♯♯ major reach. |

### Example

```typescript
new KeySignature(new Pitch("A", 0, 4), "major");   // A major
new KeySignature(new Pitch("F", 1, 4), "major");   // F♯ major
new KeySignature(new Pitch("D", -1, 4), "minor");  // D♭ minor

const aFlat = new KeySignature(new Pitch("A", -1, 4), "major");
aFlat.fifths();              // -4 — four flats
aFlat.alterationFor("B");    // -1
aFlat.alterationFor("G");    //  0
```

---

## Spelling

Choosing *how to write* a pitch that is already decided. Every function here
ranges only over enharmonically equivalent spellings, so the sound never
changes — clicking a B natural in A♭ major still gives a B natural; the only
question is whether to write it as B♮, C♭ or A♯♯.

Import from `src/music/spelling.js` (also re-exported from `src/music/index.js`).

### `SpellingContext`

The accidental environment at one point inside one measure: the key, plus the
alteration last sounded for each letter in each octave earlier in that measure.
Accidentals do not carry across a barline, so a context is only ever built from
a single measure.

```typescript
type SpellingContext = {
  readonly key: KeySignature;
  readonly alterations: ReadonlyMap<string, Accidental>;  // keyed `"F4"`
};
```

### Functions

| Function | Returns | Description |
| -------- | ------- | ----------- |
| `spellingContext(key, precedingEvents)` | `SpellingContext` | Fold the events of one measure that precede the note in question. Rests are skipped. Every `Note` is recorded, not only ones that printed an accidental: once a note has sounded, the alteration in effect for its letter and octave *is* its accidental. |
| `alterationInEffect(context, letter, octave)` | `Accidental` | What a player currently applies to that letter in that octave, falling back to `key.alterationFor(letter)`. |
| `requiresAccidental(context, pitch)` | `boolean` | Whether writing `pitch` here would print an accidental. |
| `enharmonicSpellings(semitone, maxAccidental?)` | `Pitch[]` | Every spelling of an absolute semitone (C0 = 0), in letter order C to B. `maxAccidental` defaults to 2; pass 1 to exclude double accidentals. The octave follows the letter rather than the sound, so semitone 47 yields both B3 and C♭4. |
| `spellSemitone(semitone, context)` | `Pitch` | The spelling printing the fewest accidentals here. Always a fresh `Pitch`. |
| `spellMidi(midi, context)` | `Pitch` | As `spellSemitone`, for a MIDI number (C4 = 60). |
| `spellForMelodyEvent(melody, index, midi)` | `Pitch` | The spelling to hand to `melody.setPitch(index, …)`. Resolves the tied group containing `index` and spells against the measure holding the group's **first** note, since that is where the accidental would be printed. |

### How a spelling is chosen

Candidates are ranked lexicographically, lower winning:

1. whether it prints an accidental at all,
2. whether it is a double accidental,
3. whether it runs against the key's flat/sharp direction,
4. how far it is from natural.

Rule 1 dominates, which is what makes the choice key-aware: in E major an F♯
prints nothing while a G♭ would, so F♯ wins; in D♭ major the key already flats
G, so the same sound comes out as G♭. Rules 2 and 4 are why a B natural in
A♭ major stays a plain B rather than becoming C♭ or A♯♯ — all three cost one
accidental, so the plainest spelling wins.

Only the notes **before** the target in its measure are consulted. Looking ahead
would make an earlier note's spelling depend on later ones, so re-picking the
same pitch after a later edit would silently respell an earlier note.

```typescript
const context = spellingContext(C_MAJOR, [new Note(new Pitch("E", -1, 4), QUARTER)]);
spellMidi(63, context);   // E♭4 — the earlier E♭ makes it free; D♯ would print
```

---

## `Note`

A pitched note event.

### Fields

| Field      | Type       | Description |
| ---------- | ---------- | ----------- |
| `pitch`    | `Pitch`    | Note pitch  |
| `duration` | `Duration` | Note length |

### Constructor

```typescript
new Note(pitch: Pitch, duration: Duration)
```

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `isEqual(other)` | `boolean` | Same pitch (exact) and duration (exact). Returns `false` if `other` is a `Rest`. |
| `isEnharmonicallyEqual(other)` | `boolean` | Enharmonically equal pitch and same-length duration. Returns `false` if `other` is a `Rest`. |

---

## `Rest`

A rest event (duration only, no pitch).

### Fields

| Field      | Type       | Description |
| ---------- | ---------- | ----------- |
| `duration` | `Duration` | Rest length |

### Constructor

```typescript
new Rest(duration: Duration)
```

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `isEqual(other)` | `boolean` | Same duration (exact). Returns `false` if `other` is a `Note`. |
| `isEnharmonicallyEqual(other)` | `boolean` | Same-length duration. Returns `false` if `other` is a `Note`. |

---

## `NoteEvent`

Type alias: `Note | Rest`. Use `instanceof Note` / `instanceof Rest` to distinguish.

---

## `Melody`

A multi-bar melody: fixed key and time signatures, with a mutable sequence of notes and rests.

### Fields (immutable)

| Field            | Type             | Description              |
| ---------------- | ---------------- | ------------------------ |
| `keySignature`   | `KeySignature`   | Key (cannot be changed)  |
| `timeSignature`  | `TimeSignature`  | Meter (cannot be changed)|

### Constructor

```typescript
new Melody(
  keySignature: KeySignature,
  timeSignature: TimeSignature,
  events: readonly NoteEvent[],
)
```

Events are copied into internal storage; the passed array is not aliased.

### Accessors

| Member | Type | Description |
| ------ | ---- | ----------- |
| `eventCount` | `number` | Number of events in the melody. |
| `getEvent(index)` | `NoteEvent` | Event at `index`. Throws `RangeError` if out of range. |

### Mutation

| Method | Description |
| ------ | ----------- |
| `setPitch(index, pitch)` | Replace the pitch of a `Note`. If the event is in a tied group, the same pitch is applied to every `Note` in that group, preserving each event's duration. Throws `TypeError` on a `Rest`. |
| `setDuration(index, duration)` | Replace the duration of a `Note` or `Rest`. Throws `TypeError` if the event is in a tuplet group and `duration.tuplet` differs from that group's ratio. |

Key and time signatures cannot be changed after construction.

### Ties

Ties connect **adjacent** events in the melody's event list, asserting they are one continuous sound. Tie state lives on `Melody` only (not on `Note`, `Rest`, or `Duration`).

A tie always links `events[i]` to `events[i + 1]`. A **tied group** is a maximal run of consecutive tied-together indices; for example, if indices 2–3 and 3–4 are tied, then `getTiedGroup(3)` returns `[2, 3, 4]`.

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `tie(index)` | `void` | Tie `events[index]` to `events[index + 1]`. Both must be `Note`s with exactly equal pitch (`Pitch.isEqual`, not enharmonic). Throws `RangeError` if `index + 1` is out of range; throws `TypeError` if either event is a `Rest` or pitches differ. |
| `untie(index)` | `void` | Remove the tie between `events[index]` and `events[index + 1]`, if present. Safe no-op when no tie exists. |
| `isTiedToNext(index)` | `boolean` | Whether `events[index]` is tied to the next event. Throws `RangeError` if `index` is out of range. |
| `isTiedToPrev(index)` | `boolean` | Whether `events[index]` is tied to the previous event. Throws `RangeError` if `index` is out of range. |
| `getTiedGroup(index)` | `number[]` | Sorted indices of the maximal tie chain containing `index`, including `index` itself. Returns `[index]` when the event is not tied to anything. Throws `RangeError` if `index` is out of range. |

To change the pitch of a single event within a tied group, call `untie()` first; `setPitch` always updates the whole group.

Ties may cross barlines. When a melody is split into measures (see [`splitIntoMeasures`](#splitintomeasures)), within-measure ties appear in each measure's local `tiedToNext`, while cross-barline ties appear as `tiedToNextBar` / `tiedToPrevBar` on adjacent measures.

### Tuplets

The two halves of a tuplet live in different places. The **ratio** lives on each event's `Duration` — a `Duration` is always the length it claims to be, with no outside context needed. The **grouping** (which consecutive events share one bracket) lives on the `Melody`, because it is a notation choice, not a property of any single note: six eighth-note triplets in a row could be two brackets or one.

`groupTuplet` only records the grouping. It reads the ratio off the events themselves and never modifies them.

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `groupTuplet(startIndex, count)` | `void` | Bracket `count` consecutive events starting at `startIndex`. Throws `RangeError` if `count < 2` or is not an integer, if the span runs past the end of the melody, if any covered event is already in a group, or if the group is **incomplete** (see below). Throws `TypeError` if the first event's duration has no tuplet, or if the covered events do not all share the same ratio. |
| `ungroupTuplet(startIndex)` | `void` | Remove the group starting at `startIndex`, if present. Safe no-op otherwise. Event durations keep their ratios. |
| `getTupletSpan(index)` | `TupletSpan` | The group containing `index`. When the event is not grouped, returns the lone span `{ start: index, count: 1, tuplet: Tuplet.None }`. Throws `RangeError` if `index` is out of range. |
| `tupletSpans()` | `TupletSpan[]` | Every group, ordered by `start`. Ungrouped events are not listed. |

A group is **complete** when its total sounding length can be notated without the tuplet — that is, when the denominator of that length is a power of two. Three eighth-note triplets fill a quarter (3 × 1/12 = 1/4); five sixteenth quintuplets fill a quarter (5 × 1/20 = 1/4). Any shorter run leaves a denominator the ratio never divides out, so `groupTuplet` rejects it.

The rule is stated in lengths rather than note counts so mixed durations work: a triplet written as a quarter plus an eighth is two events, not three, but still fills three eighth units (1/6 + 1/12 = 1/4) and is accepted.

Every event whose duration carries a tuplet must be grouped: an ungrouped one is caught by [`splitIntoMeasures`](#splitintomeasures) as an `UngroupedTupletError`, since VexFlow needs one bracket object per group to make a measure's ticks add up. Groups may not cross barlines.

```typescript
const melody = new Melody(KEY, { beats: 4, beatUnit: 4 }, [
  new Note(new Pitch("C", 0, 5), new Duration(NoteValue.Eighth, 0, Tuplet.Triplet)),
  new Note(new Pitch("D", 0, 5), new Duration(NoteValue.Eighth, 0, Tuplet.Triplet)),
  new Note(new Pitch("E", 0, 5), new Duration(NoteValue.Eighth, 0, Tuplet.Triplet)),
  // ...
]);

melody.groupTuplet(0, 3);   // one 3:2 bracket over the first three events
melody.getTupletSpan(1);    // { start: 0, count: 3, tuplet: Tuplet.Triplet }
```

### Equality

| Method | Description |
| ------ | ----------- |
| `isEqual(other)` | Exact equality: key, meter, every event (spelling and notation), and tie and tuplet structure at every index. |
| `isEnharmonicallyEqual(other)` | Same sounding melody: enharmonic pitches, same-length durations, enharmonically equivalent key, and the same tie and tuplet structure. |

### Playback

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `playback(bpm)` | `Uint8Array` | Renders the melody to WAV bytes (44.1 kHz, mono, 16-bit PCM). `bpm` is quarter-note beats per minute. Throws `RangeError` if `bpm ≤ 0`. |

Write the bytes to a `.wav` file to listen:

```typescript
import { writeFileSync } from "node:fs";

const wav = melody.playback(120);
writeFileSync("out.wav", wav);
```

See `src/demo/play-melody.ts` for a full example (`npm run demo` → `out/demo.wav`).

### Example

```typescript
const melody = new Melody(
  new KeySignature(new Pitch("C", 0, 4), "major"),
  { beats: 4, beatUnit: 4 },
  [
    new Note(new Pitch("E", 0, 4), new Duration(NoteValue.Quarter)),
    new Note(new Pitch("F", 0, 4), new Duration(NoteValue.Quarter)),
    new Rest(new Duration(NoteValue.Half)),
  ],
);

melody.setPitch(0, new Pitch("D", 0, 4));
melody.playback(96);
```

Tie three consecutive C4 notes and then retune the middle one — all three update together:

```typescript
const tied = new Melody(
  new KeySignature(new Pitch("C", 0, 4), "major"),
  { beats: 4, beatUnit: 4 },
  [
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Quarter)),
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Quarter)),
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Half)),
  ],
);

tied.tie(0);
tied.tie(1);
tied.setPitch(1, new Pitch("D", 0, 4)); // all three become D4; durations unchanged
tied.getTiedGroup(1);                   // [0, 1, 2]
```

---

## `Fraction`

Exact rational number used for duration arithmetic (whole-note fractions). All measure-length math uses `Fraction` methods — never floating-point comparison.

Import from `src/music/fraction.js`.

### Fields

| Field | Type     | Description |
| ----- | -------- | ----------- |
| `num` | `number` | Numerator   |
| `den` | `number` | Denominator |

### Constructor

```typescript
new Fraction(num: number, den: number)
```

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `reduce()` | `Fraction` | Lowest terms with a positive denominator. |
| `add(other)` | `Fraction` | Sum, reduced. |
| `multiply(other)` | `Fraction` | Product, reduced. |
| `difference(other)` | `Fraction` | This minus `other`, reduced. |
| `compare(other)` | `number` | Negative / zero / positive for `<` / `=` / `>`. |
| `equals(other)` | `boolean` | Same rational value (e.g. 1/2 equals 2/4). |
| `toString()` | `string` | Reduced form as `"num/den"`. |

---

## `Measure`

An immutable snapshot of one bar produced by splitting a `Melody`. It is a read-only view — there is no `setPitch`, `setDuration`, `tie`, or `untie` on `Measure`. After editing the source `Melody`, call `splitIntoMeasures` again to regenerate measures.

Import from `src/music/measure.js`.

### Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `startIndex` | `number` | Index into the original `Melody` event list of this measure's first event. |
| `events` | `readonly NoteEvent[]` | Slice of the melody's events that belong to this measure, in order. |
| `tiedToNext` | `ReadonlySet<number>` | **Local** indices (0-based within `events`) where the event is tied to the next event *inside this measure*. Same shape/semantics as `Melody`'s internal ties, but scoped to the measure. Cross-barline ties are **not** listed here. |
| `tiedToPrevBar` | `boolean` | Whether this measure's first event is tied to the previous measure's last event. Always `false` for the first measure. |
| `tiedToNextBar` | `boolean` | Whether this measure's last event is tied to the next measure's first event. Always `false` for the last measure (and whenever there is no following event). |
| `tuplets` | `readonly TupletSpan[]` | Tuplet groups in this measure, with `start` rebased to a **local** index. Ungrouped events are not listed, and no group ever crosses a barline. Consumed directly by the renderer to build one VexFlow `Tuplet` per bracket. |

### Constructor

```typescript
new Measure(
  startIndex: number,
  events: readonly NoteEvent[],
  tiedToNext: ReadonlySet<number>,
  tiedToPrevBar: boolean,
  tiedToNextBar: boolean,
  tuplets: readonly TupletSpan[],
)
```

Typically constructed only by `splitIntoMeasures`; callers usually do not build `Measure`s by hand.

---

## `splitIntoMeasures`

```typescript
splitIntoMeasures(melody: Melody): Measure[]
```

Divides a melody's flat event sequence into bars using `melody.timeSignature`.

### Algorithm (summary)

1. Measure length \(N\) is the fraction `{ beats / beatUnit }` of a whole note (e.g. 4/4 → `4/4`, 3/8 → `3/8`).
2. Scan events in order, accumulating each event's `asWholeNoteFraction()` with exact `Fraction` arithmetic.
3. When the running total equals \(N\), finalize a `Measure` (including local ties and barline-tie flags), then reset the accumulator.
4. If an event would make the total **strictly greater** than \(N\), throw `MeasureOverflowError`.
5. If the melody ends with a partially filled measure (total \(> 0\) but \(< N\)), throw `IncompleteMeasureError`. Partial final measures are **not** auto-padded with rests.

Tie status never affects length math: a tied note always contributes its own notated duration. Ties only affect `tiedToNext`, `tiedToPrevBar`, and `tiedToNextBar` on the resulting measures. Tuplets do not need special handling either — `asWholeNoteFraction()` already returns the sounding length — but the grouping is validated and rebased into each measure's `tuplets`.

### Errors

| Error | When | Notable fields |
| ----- | ---- | -------------- |
| `MeasureOverflowError` | An event pushes the running total past \(N\). | `eventIndex`, `measureStartIndex`, `overflow` (`Fraction`) |
| `IncompleteMeasureError` | The melody ends mid-measure. | `measureStartIndex`, `filled` (`Fraction`), `needed` (`Fraction`) |
| `TupletAcrossBarlineError` | A tuplet group extends past the end of the measure it starts in. | `spanStartIndex`, `measureStartIndex` |
| `UngroupedTupletError` | An event's duration carries a tuplet but no `groupTuplet` call covers it. | `eventIndex` |

Distinguish with `instanceof`; they are separate classes.

### Example

```typescript
const melody = new Melody(
  new KeySignature(new Pitch("C", 0, 4), "major"),
  { beats: 4, beatUnit: 4 },
  [
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Half)),
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Half)),
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Whole)),
  ],
);

melody.tie(1); // last note of bar 1 tied to first note of bar 2

const measures = splitIntoMeasures(melody);
// measures.length === 2
// measures[0].startIndex === 0, events.length === 2, tiedToNextBar === true
// measures[1].startIndex === 2, events.length === 1, tiedToPrevBar === true
// neither measure lists the cross-barline tie in local tiedToNext
```
