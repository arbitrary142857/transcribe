# Music ADTs

TypeScript abstract data types for representing multi-bar melodies. Core types import from `src/music/index.js`; measures and fractions import from their own modules (see below).

```typescript
import {
  Pitch,
  Duration,
  NoteValue,
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
} from "./music/measure.js";

import { Fraction } from "./music/fraction.js";
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

Named constants for note lengths. Each numeric value is the **denominator of 1/n of a whole note** (e.g. `4` → quarter note → 1/4 of a whole).

### Constants

| Name | Value | Length (of whole) |
| ---- | ----- | ----------------- |
| `Whole` | 1 | 1/1 |
| `Half` | 2 | 1/2 |
| `HalfTriplet` | 3 | 1/3 |
| `Quarter` | 4 | 1/4 |
| `QuarterTriplet` | 6 | 1/6 |
| `Eighth` | 8 | 1/8 |
| `EighthTriplet` | 12 | 1/12 |
| `Sixteenth` | 16 | 1/16 |
| `SixteenthTriplet` | 24 | 1/24 |
| `ThirtySecond` | 32 | 1/32 |

Triplet entries are one note within a standard triplet group (three notes in the time of two).

---

## `Duration`

A notated note or rest length: a `NoteValue` plus optional augmentation dots.

### Fields

| Field   | Type        | Description                              |
| ------- | ----------- | ---------------------------------------- |
| `value` | `NoteValue` | Base note length (see table above)       |
| `dots`  | `number`    | Number of augmentation dots (default 0)  |

### Constructor

```typescript
new Duration(value: NoteValue, dots?: number)
```

Throws `RangeError` if `dots` is negative or not an integer.

Each dot adds half of the **original** note value (one dot → ×3/2, two dots → ×7/4, etc.).

### Methods

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `isEqual(other)` | `boolean` | Same `value` and `dots` (exact notation). |
| `asWholeNoteFraction()` | `Fraction` | Length as a reduced fraction of a whole note. |
| `sameLengthAs(other)` | `boolean` | Same sounding length, possibly different notation. |
| `inSeconds(bpm)` | `number` | Wall-clock duration at the given quarter-note BPM. |

### Example

```typescript
new Duration(NoteValue.Quarter);           // quarter note
new Duration(NoteValue.Quarter, 1);        // dotted quarter
new Duration(NoteValue.EighthTriplet);     // one eighth-note triplet
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

### Example

```typescript
new KeySignature(new Pitch("A", 0, 4), "major");   // A major
new KeySignature(new Pitch("F", 1, 4), "major");   // F♯ major
new KeySignature(new Pitch("D", -1, 4), "minor");  // D♭ minor
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
| `setDuration(index, duration)` | Replace the duration of a `Note` or `Rest`. |

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

### Equality

| Method | Description |
| ------ | ----------- |
| `isEqual(other)` | Exact equality: key, meter, every event (spelling and notation), and tie structure at every index. |
| `isEnharmonicallyEqual(other)` | Same sounding melody: enharmonic pitches, same-length durations, enharmonically equivalent key, and the same tie structure. |

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

### Constructor

```typescript
new Measure(
  startIndex: number,
  events: readonly NoteEvent[],
  tiedToNext: ReadonlySet<number>,
  tiedToPrevBar: boolean,
  tiedToNextBar: boolean,
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

Tie status never affects length math: a tied note always contributes its own notated duration. Ties only affect `tiedToNext`, `tiedToPrevBar`, and `tiedToNextBar` on the resulting measures.

### Errors

| Error | When | Notable fields |
| ----- | ---- | -------------- |
| `MeasureOverflowError` | An event pushes the running total past \(N\). | `eventIndex`, `measureStartIndex`, `overflow` (`Fraction`) |
| `IncompleteMeasureError` | The melody ends mid-measure. | `measureStartIndex`, `filled` (`Fraction`), `needed` (`Fraction`) |

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
