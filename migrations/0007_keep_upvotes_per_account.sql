-- Whether a solver liked a level: one heart per player per level, or none.
--
-- The shape is ratings' (0006) minus the word: the primary key is the whole
-- of the rule "one upvote each", both foreign keys cascade on delete, and
-- neither cascades on update so that the unpublish route's id move is
-- refused while any upvote still points at the old id -- the same backstop
-- 0004 built for progress and 0006 for ratings, and the same duty on the
-- route to delete first, in the same batch.
--
-- No updated_at, unlike ratings, because an upvote has nothing to update:
-- it is either standing or it is not. Taking it back deletes the row, and
-- upvoting again mints a new one whose created_at honestly says when the
-- heart came back.
--
-- Who counts is asked when the figures are read, never here: the listing
-- joins users on share_stats, exactly as it does for ratings, so an account
-- that stops sharing takes its hearts out of every count at once.

CREATE TABLE upvotes (
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id   TEXT    NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, level_id)
);

-- The primary key serves the point lookup; this serves the listing's count,
-- the unpublish route's DELETE by level, and the cascade when a level goes.
CREATE INDEX idx_upvotes_level ON upvotes (level_id);
