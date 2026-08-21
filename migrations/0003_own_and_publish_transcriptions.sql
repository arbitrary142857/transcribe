-- Every level gets an owner, and a life: draft, then published, then perhaps
-- a draft again.
--
-- The table is rebuilt rather than altered, because SQLite will not add a
-- column that is both NOT NULL and a foreign key -- a column added in place
-- has to allow NULL, and a level nobody owns is exactly the thing this
-- migration exists to make impossible. So: a new table with the four extra
-- columns, every row copied across, the old table dropped, the new one
-- renamed. The fifteen content columns are restated from 0001 word for word.
--
-- Two claims made by earlier migrations are retired here, and left standing
-- there because those files were applied and an applied migration is history:
-- 0001 said "nothing here is ever updated", which stopped being true when
-- editing arrived and is squarely untrue now that there is an updated_at;
-- 0002 said "nothing here yet references transcriptions", which was the
-- promise that this file would.
--
-- The life of a level. A draft is saved work: its owner (and an admin) can
-- open it, play it and change it, and nobody else is told it exists. Publishing
-- requires every note to have a pitch, stamps published_at, and freezes the
-- music -- from then on only the title, subtitle and instructions may change.
-- Unpublishing turns it back into a draft under a NEW id, so that whatever
-- anybody held against the old one -- a bookmark, progress kept in a browser
-- -- points at nothing rather than at music that may since have changed.
--
-- Whatever levels exist when this runs are handed to the earliest account, the
-- one that signed in first, which on every database this has been run on is
-- the author's own. Finished ones are published as of their creation, which
-- is what they effectively were; unfinished ones become drafts, which is what
-- the play routes already treated them as. On a database with levels and no
-- accounts at all, the copy below writes NULL into a NOT NULL column and the
-- whole migration fails loudly -- sign in once first. The deployed database has
-- no levels, so there the copy is a copy of nothing.
--
-- No PRAGMA defer_foreign_keys is needed. D1 enforces foreign keys throughout,
-- and the only one in play is the new one, which every copied row satisfies by
-- construction: its owner is read out of the users table itself. Nothing
-- references transcriptions, so dropping the old table checks nothing.

CREATE TABLE transcriptions_next (
  id           TEXT    PRIMARY KEY,

  -- Whose it is: who may open the source, change it, publish it, delete it.
  -- An admin may too, but that is a fact about the admin, not about the row.
  owner_id     TEXT    NOT NULL REFERENCES users(id),

  title        TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
  subtitle     TEXT             CHECK (subtitle IS NULL OR length(subtitle) <= 128),
  instructions TEXT             CHECK (instructions IS NULL OR length(instructions) <= 600),
  video_id     TEXT    NOT NULL CHECK (length(video_id) = 11),
  mark_start   REAL    NOT NULL CHECK (mark_start >= 0),
  mark_end     REAL    NOT NULL CHECK (mark_end > mark_start),
  measures     INTEGER NOT NULL CHECK (measures BETWEEN 1 AND 999),
  clef         TEXT    NOT NULL CHECK (clef IN ('treble', 'bass')),
  meter_beats  INTEGER NOT NULL CHECK (meter_beats > 0),
  meter_unit   INTEGER NOT NULL CHECK (meter_unit IN (1, 2, 4, 8, 16, 32)),
  key_fifths   INTEGER NOT NULL CHECK (key_fifths BETWEEN -7 AND 7),
  key_mode     TEXT    NOT NULL CHECK (key_mode IN ('major', 'minor')),
  note_count   INTEGER NOT NULL CHECK (note_count >= 2),
  unpitched_count INTEGER NOT NULL
    CHECK (unpitched_count >= 0 AND unpitched_count <= note_count),
  -- MelodyJson, verbatim. The answer.
  melody       TEXT    NOT NULL,

  -- Which of the two lives the level is in. The public listing reads only
  -- 'published', so a draft is never named to anybody but its owner.
  status       TEXT    NOT NULL CHECK (status IN ('draft', 'published')),

  -- The moment it went public, and nothing while it is a draft. The first
  -- CHECK below makes the two agree, so a route cannot forget either half.
  published_at INTEGER,

  created_at   INTEGER NOT NULL,

  -- Moved by every write, publishing included -- so a freshly published level
  -- floats to the top of its author's list, which is where they will look for
  -- it. What "my transcriptions" sorts by.
  updated_at   INTEGER NOT NULL,

  -- Published means it has a published_at, and a draft means it has none.
  CHECK ((status = 'published') = (published_at IS NOT NULL)),

  -- A published level is a puzzle, and a puzzle with a blank in it can mark
  -- nobody's attempt. The publish route says this in a sentence; this is the
  -- backstop that makes the sentence a fact.
  CHECK (status = 'draft' OR unpitched_count = 0)
);

INSERT INTO transcriptions_next (
  id, owner_id, title, subtitle, instructions, video_id, mark_start, mark_end,
  measures, clef, meter_beats, meter_unit, key_fifths, key_mode,
  note_count, unpitched_count, melody, status, published_at, created_at, updated_at
)
SELECT
  id,
  (SELECT id FROM users ORDER BY created_at LIMIT 1),
  title, subtitle, instructions, video_id, mark_start, mark_end,
  measures, clef, meter_beats, meter_unit, key_fifths, key_mode,
  note_count, unpitched_count, melody,
  CASE WHEN unpitched_count = 0 THEN 'published' ELSE 'draft' END,
  CASE WHEN unpitched_count = 0 THEN created_at END,
  created_at,
  created_at
FROM transcriptions;

-- The old table takes idx_transcriptions_created with it.
DROP TABLE transcriptions;
ALTER TABLE transcriptions_next RENAME TO transcriptions;

-- Serves the listing: WHERE status = ? ORDER BY created_at DESC. A composite
-- index rather than a partial one, because the route binds the status as a
-- value, and a partial index is used only when the query spells the literal.
CREATE INDEX idx_transcriptions_published
  ON transcriptions (status, created_at DESC);

-- Serves "my transcriptions": WHERE owner_id = ? ORDER BY updated_at DESC.
CREATE INDEX idx_transcriptions_owner
  ON transcriptions (owner_id, updated_at DESC);
