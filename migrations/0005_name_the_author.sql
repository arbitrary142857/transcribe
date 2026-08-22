-- Every level gets an author's name, every author a name to show, and every
-- author two things to say about themselves.
--
-- The name is a fact about the user, not the level: it lives in users, and a
-- rename renames every byline at once. It was always going to be chosen on
-- a page of one's own; what changed is that nobody is made to choose. A name
-- is minted at sign-in for any account that has none -- two words and, when
-- those are taken, a number -- so the corner of every page shows a name from
-- the first moment and usernames are self-evidently a thing. chose_username
-- records whether the person has picked their own, which is what lets the
-- site say, once and quietly, "this was picked for you". The username column
-- itself stays nullable, because 0002 is applied and applied migrations are
-- history; the sign-in route is what keeps it filled, and every reader still
-- shows "Anonymous" for a row that predates this and never signs in again.
--
-- Anonymity is the author's setting, not the level's: anonymous_author hides
-- the name on every byline at once, and the level stays public. share_stats
-- exists before anything reads it. Phase 6 will work out how hard a level is
-- from how people play it, and a person who would rather their play not
-- count has somewhere to say so from the day the figures appear rather than
-- the day after.
--
-- Difficulty is the author's word: half a star to five, in halves, which is
-- stored as the number of halves so that every column stays an integer and
-- the display can change its mind about what a half-star looks like, or how
-- the author's word is blended with play data, without the table changing.
-- Nullable, because an author need not say.
--
-- One claim made by 0004 is retired here and left standing there, as 0003
-- did for 0001 and 0002: 0004 says a published level is one "which phase 4
-- will keep and anonymize" when its author's account is deleted. It will not.
-- Deleting an account deletes what it published, because the author owns the
-- work, the site holds no licence to keep it, and somebody who published
-- something they should not have must be able to take it down by leaving.
-- That is a route's decision and needs nothing from the schema: the users
-- foreign key on transcriptions has no cascade, so the route deletes the
-- levels first, and the database would refuse the account's deletion if it
-- forgot.

ALTER TABLE users ADD COLUMN chose_username INTEGER NOT NULL DEFAULT 0
  CHECK (chose_username IN (0, 1));

ALTER TABLE users ADD COLUMN anonymous_author INTEGER NOT NULL DEFAULT 0
  CHECK (anonymous_author IN (0, 1));

ALTER TABLE users ADD COLUMN share_stats INTEGER NOT NULL DEFAULT 1
  CHECK (share_stats IN (0, 1));

ALTER TABLE transcriptions ADD COLUMN difficulty_half INTEGER
  CHECK (difficulty_half IS NULL OR difficulty_half BETWEEN 1 AND 10);
