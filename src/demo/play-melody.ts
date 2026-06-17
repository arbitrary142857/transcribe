import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Duration,
  KeySignature,
  Melody,
  Note,
  NoteValue,
  Pitch,
  Rest,
} from "../music/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "../../out/demo.wav");

const melody = new Melody(
  new KeySignature(new Pitch("C", 0, 4), "major"),
  { beats: 4, beatUnit: 4 },
  [
    new Note(new Pitch("C", 0, 4), new Duration(NoteValue.Quarter)),
    new Note(new Pitch("E", 0, 4), new Duration(NoteValue.Quarter)),
    new Note(new Pitch("G", 0, 4), new Duration(NoteValue.Quarter)),
    new Rest(new Duration(NoteValue.Quarter)),
    new Note(new Pitch("G", 0, 4), new Duration(NoteValue.Eighth)),
    new Note(new Pitch("A", 0, 4), new Duration(NoteValue.Eighth)),
    new Note(new Pitch("B", 0, 4), new Duration(NoteValue.Quarter)),
    new Note(new Pitch("C", 0, 5), new Duration(NoteValue.Half)),
  ],
);

const bpm = 96;
const wav = melody.playback(bpm);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, wav);

console.log(`Wrote ${outputPath} (${bpm} bpm, ${melody.eventCount} events)`);
