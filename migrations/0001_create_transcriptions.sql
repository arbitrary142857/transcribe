-- A transcription as submitted: the music, the video it was written down from,
-- and what its author called it.
--
-- The music lives in one column as the JSON that `encode()` already produces,
-- because that round trip is tested and a second format would be a second thing
-- to keep true. What the codec has no room for -- the clef, the video, the two
-- marks, the bar count -- becomes columns, as does everything a level card
-- shows. That last part is the point: the listing query can then name its
-- columns and never mention `melody` at all, so it cannot hand out the pitches
-- by accident. Once these are puzzles, the pitches are the answer.
--
-- Nothing here is ever updated, so the columns copied out of the melody cannot
-- drift from it.

CREATE TABLE transcriptions (
  id           TEXT    PRIMARY KEY,

  title        TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
  subtitle     TEXT             CHECK (subtitle IS NULL OR length(subtitle) <= 128),

  -- What the author wants known before the level is played: "transcribe the
  -- flute part", "ignore the grace notes", "listen to the bass for a clue".
  -- Shown on the level's modal and behind the information button while playing.
  --
  -- 600 rather than a few thousand: instructions like those run one or two
  -- lines apiece, so this holds about eight of them, and it fills the modal at
  -- a readable measure without becoming something to scroll. Newlines are
  -- allowed, because they are how those lines separate.
  --
  -- `length()` counts characters here rather than bytes, which is what lets
  -- LIMITS in shared/transcription.ts mirror these numbers exactly.
  instructions TEXT             CHECK (instructions IS NULL OR length(instructions) <= 600),

  -- The 11 characters YouTube names a video by; the rest of a pasted link is
  -- thrown away long before here, by readYouTubeLink().
  video_id     TEXT    NOT NULL CHECK (length(video_id) = 11),

  -- Video seconds: where the first bar starts and the last bar ends. Video
  -- seconds do not care how fast it was being played back, so a mark taken at
  -- half speed still names the same moment.
  mark_start   REAL    NOT NULL CHECK (mark_start >= 0),
  mark_end     REAL    NOT NULL CHECK (mark_end > mark_start),

  measures     INTEGER NOT NULL CHECK (measures BETWEEN 1 AND 999),
  clef         TEXT    NOT NULL CHECK (clef IN ('treble', 'bass')),

  -- Copied out of the melody so a level card can be drawn without reading it.
  -- Held NOT NULL rather than nullable-in-advance: the melody always carries a
  -- key, and a column that could say otherwise could disagree with it. If a
  -- melody is ever allowed to assert no key, KeySignature has to grow a way to
  -- say so first, and this column follows in the same migration.
  meter_beats  INTEGER NOT NULL CHECK (meter_beats > 0),
  meter_unit   INTEGER NOT NULL CHECK (meter_unit IN (1, 2, 4, 8, 16, 32)),
  key_fifths   INTEGER NOT NULL CHECK (key_fifths BETWEEN -7 AND 7),
  key_mode     TEXT    NOT NULL CHECK (key_mode IN ('major', 'minor')),

  -- Note groupings, not noteheads: a tied run is one note, however many heads
  -- it is written with, and rests are none. Ten heads whose first nine are tied
  -- together count 2.
  --
  -- At least 2, because the puzzle gives the first grouping away. A level with
  -- one grouping would open already solved. The submit route has to refuse this
  -- itself and say why -- reaching this CHECK means the message the author sees
  -- is a raw SQLite error.
  note_count   INTEGER NOT NULL CHECK (note_count >= 2),

  -- How many of those groupings are still waiting for a pitch.
  --
  -- Zero means the transcription is finished, and finished is what a puzzle
  -- has to be: an answer with blanks in it cannot mark anyone's attempt. More
  -- than zero means a draft, which is allowed -- rhythm is real work and worth
  -- saving on its own -- and is what a card says when it calls itself
  -- unfinished.
  --
  -- A column rather than a look inside `melody`, for the reason every card
  -- fact is a column: the listing query must never read the answer.
  unpitched_count INTEGER NOT NULL
    CHECK (unpitched_count >= 0 AND unpitched_count <= note_count),

  -- MelodyJson, verbatim. The answer.
  melody       TEXT    NOT NULL,

  created_at   INTEGER NOT NULL
);

-- The level list is newest-first and nothing else, so far.
CREATE INDEX idx_transcriptions_created ON transcriptions (created_at DESC);
