# Music ADTs

TypeScript abstract data types for representing multi-bar melodies. Import from `src/music/index.js`.

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
| `asWholeNoteFraction()` | `{ num, den }` | Length as a reduced fraction of a whole note. |
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
| `setPitch(index, pitch)` | Replace the pitch of a `Note`. Throws `TypeError` on a `Rest`. |
| `setDuration(index, duration)` | Replace the duration of a `Note` or `Rest`. |

Key and time signatures cannot be changed after construction.

### Equality

| Method | Description |
| ------ | ----------- |
| `isEqual(other)` | Exact equality: key, meter, and every event (spelling and notation). |
| `isEnharmonicallyEqual(other)` | Same sounding melody: enharmonic pitches, same-length durations, enharmonically equivalent key. |

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
