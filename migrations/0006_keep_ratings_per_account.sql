-- What solvers say a level's difficulty is, one word per player per level,
-- kept beside the author's.
--
-- Phase 6's model is a weighted average and nothing derived is ever stored:
-- the author's word (difficulty_half, from 0005) counts as a few votes, each
-- row here counts as one, and the number a card shows is worked out at read
-- time by src/shared/difficulty.ts from figures the listing query aggregates
-- on the spot. A rating only counts while its account's share_stats says yes,
-- and that too is asked at read time, so changing the setting changes every
-- figure at once -- there is no stored total to chase.
--
-- The shape is progress's on purpose. One row per (player, level), which is
-- what the primary key says and what makes the rating route's upsert an
-- upsert. Both foreign keys cascade on delete and neither cascades on update,
-- and both of those are 0004's choices for 0004's reasons: a rating is about
-- one account's experience of one level's music, so it goes when either goes;
-- and unpublishing gives a level a NEW id in place, so with ON UPDATE CASCADE
-- the votes would follow the id to a draft whose music is about to change --
-- the exact thing the new id exists to prevent. Without it, the database
-- refuses the UPDATE while any rating still points at the old id, and the
-- unpublish route deletes them first, in the same batch. A refusal from the
-- database is the backstop for a route that forgets to.
--
-- Unlike progress there IS a created_at: a rating is written whole by its one
-- author in one moment, so its birth has one honest answer, and the upsert
-- keeps it while moving updated_at.
--
-- half is the rating as a count of half-peppers, 1 to 10, the same coding
-- difficulty_half uses and for the same reason: every column stays an integer
-- while the display makes up its own mind about what a half looks like.

CREATE TABLE ratings (
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id   TEXT    NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  half       INTEGER NOT NULL CHECK (half BETWEEN 1 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, level_id)
);

-- The primary key serves the point lookup; this serves the listing's
-- aggregate, the unpublish route's DELETE by level, and the cascade when a
-- level is deleted, none of which should scan every player's rows.
CREATE INDEX idx_ratings_level ON ratings (level_id);

-- Publishing now requires the author's word, and the display's "?" for a
-- level without one is gone with it. Levels published before either rule
-- existed get the middle of the scale -- two and a half, "for now", for the
-- author to change from the details box -- so that every published level has
-- the anchor the model leans on. Drafts stay as they are: their authors will
-- be asked before publishing.
UPDATE transcriptions SET difficulty_half = 5
 WHERE status = 'published' AND difficulty_half IS NULL;
