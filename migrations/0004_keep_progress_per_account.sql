-- Where each player got to on each level, kept on the server rather than in
-- a browser.
--
-- One row per (player, level), which is what the primary key says, and it is
-- the same shape `PlayProgress` has had in local storage since the play page
-- was built -- the two JSON columns hold the arrays that were always JSON, and
-- the numbers are the numbers. Nothing is migrated in: a browser's records
-- reach this table through the merge route, once, when their owner signs in
-- and says yes.
--
-- Two of the columns are the server's and the rest are the page's.
-- check_count and solved_at are written only by the check route, which is the
-- one thing that knows whether a check happened and what it said; elapsed_ms,
-- pitches and judged are what the page saves as it goes, because the page is
-- the only thing holding the clock and the stave. The last CHECK below is the
-- one fact that ties the two halves together: nobody is solved without having
-- checked.
--
-- Both foreign keys cascade on delete, and neither cascades on update, and
-- both of those are choices. A player's progress is theirs alone -- no other
-- account reads it -- so when the account goes, it goes, unlike a published
-- level, which phase 4 will keep and anonymize. A level's progress describes
-- positions in that level's music, so when the level goes there is nothing
-- left for a row to describe. And unpublishing gives a level a NEW id in
-- place: with ON UPDATE CASCADE the progress would follow the id to the draft
-- and meet music the author is about to change note by note, which is the
-- exact thing the new id exists to prevent. Without it, the database refuses
-- the UPDATE while any row still points at the old id, and the unpublish
-- route deletes those rows first, on purpose, in the same batch. A refusal
-- from the database is the backstop for a route that forgets to.
--
-- No created_at. The moment a player first touched a level is a fact nothing
-- shows or sorts by -- the card shows when it was solved and what the score
-- was -- and the merge route writes a row whole from whichever side won,
-- which would leave a created_at with no honest answer to whose birth it
-- records. The column is additive the day something wants it.

CREATE TABLE progress (
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id    TEXT    NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,

  -- Time with the tab showing, in whole milliseconds, as the page's stopwatch
  -- counts it. The page's number and nobody else's; see docs/progress.md.
  elapsed_ms  INTEGER NOT NULL CHECK (elapsed_ms >= 0),

  -- How many times the check route has marked this player's attempt at this
  -- level. Counted there, never taken from a request.
  check_count INTEGER NOT NULL CHECK (check_count >= 0),

  -- Epoch ms of the check that first came back all correct, or NULL. Stamped
  -- by the server's clock, and never moved once set.
  solved_at   INTEGER,

  -- [{ index, midi }] and [{ index, midi, correct }], verbatim from
  -- PlayProgress, one array each. JSON arrays and nothing else: the page reads
  -- these back as the shape it wrote, and a row that held anything else would
  -- open the puzzle fresh rather than as it was left.
  pitches     TEXT    NOT NULL CHECK (json_type(pitches) = 'array'),
  judged      TEXT    NOT NULL CHECK (json_type(judged) = 'array'),

  -- Moved by every write, from whichever route made it.
  updated_at  INTEGER NOT NULL,

  PRIMARY KEY (user_id, level_id),

  -- A solve is a check that came back all correct, so a solved row has at
  -- least one check behind it. The merge route forces this on what a browser
  -- claims; this is what makes the forcing a fact.
  CHECK (solved_at IS NULL OR check_count >= 1)
);

-- The primary key already serves "everything this player holds" (WHERE
-- user_id = ?) and the point lookup. This serves the other direction: the
-- unpublish route's DELETE by level, and the cascade when a level is deleted,
-- neither of which should scan every player's rows to find one level's.
CREATE INDEX idx_progress_level ON progress (level_id);
