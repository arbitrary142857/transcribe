# Progress

Where a player's progress on a level is kept, who may write which part of
it, how a browser's progress becomes an account's, and what the catalog does
with it. The code lives in `src/puzzle/progress.ts` (the shape, and the
local-storage store), `src/puzzle/merge.ts` (the merge rule),
`src/puzzle/account-progress.ts` (the account-backed store),
`src/puzzle/handoff.ts` (offering a browser's records to an account),
`worker/routes.ts` (the `progress` section, and `/check`'s write), and
`migrations/0004_keep_progress_per_account.sql`. Tests: `test/merge.test.ts`,
`test/api-progress.test.ts`, `test/migrations.test.ts` (which runs every
progress statement against real SQLite), `test/account-progress.test.ts`,
`test/handoff.test.ts`.

## What is kept

A `PlayProgress` is one player's state on one level, and it has been the same
flat JSON since the play page was built:

```
levelId      which level
elapsedMs    time with the tab showing, by the page's stopwatch
checkCount   how many times Check has been pressed
solvedAt     epoch ms of the check that came back all correct, or absent
pitches      [{ index, midi }]           what is written on the stave
judged       [{ index, midi, correct }]  every guess a check has judged
```

For somebody signed out it lives in their browser, under
`localStorage["transcribe:progress:<levelId>"]`, and nothing about it ever
reaches the server. For somebody signed in it is a row:

```
progress  user_id      -> users.id, ON DELETE CASCADE
          level_id     -> transcriptions.id, ON DELETE CASCADE
          elapsed_ms   INTEGER >= 0
          check_count  INTEGER >= 0
          solved_at    INTEGER or NULL
          pitches      TEXT, a JSON array
          judged       TEXT, a JSON array
          updated_at   epoch ms, moved by every write
          PRIMARY KEY (user_id, level_id)
          CHECK        solved_at IS NULL OR check_count >= 1
```

One row per (account, level). There is no second row anywhere for the same
pair, which is why nothing can be counted twice.

## Who writes what

**The server owns `check_count` and `solved_at`.** `/check` is the one thing
that knows a check happened and what it said, so when somebody signed in
checks, the route counts it and, on a solve, stamps the moment from its own
clock. Nothing a page sends can claim a check or a solve.

**The page owns `elapsed_ms`, `pitches` and `judged`.** The page is the only
thing holding the clock and the stave, so it saves those through
`PUT /api/progress/:levelId` as it goes -- debounced after an edit, at once
after a check, on the tab hiding, and on the way out. The body may say what
it likes about the count or the solve; the route does not read those fields.

**A solved row is finished.** `/check` writes nothing to a row whose
`solved_at` is set (the upsert's `WHERE solved_at IS NULL`): the page stops
checking once solved, and this is the server agreeing, for a tab that did not
hear. A PUT to a solved row keeps the pitches too -- the page treats them as
confirmed -- but still takes the clock and the verdicts, because the save that
follows the solving check is what carries the stopped clock and the final
colouring.

Why the count is the server's at all: `/check` is an oracle, and the count
beside the time is what makes a solve arrived at by forty guesses read as one.
A count the page kept could be anything; this one is the number of times the
route was asked. The clock stays the page's until times are compared between
people, which they are not.

## The routes

| route | session | no session | stranger, published | stranger, draft |
| --- | --- | --- | --- | --- |
| `POST /api/tunes/:id/check` | if a cookie is sent | 200, nothing written | 200, counted | 404 |
| `GET /api/progress` | required | 401 | -- | -- |
| `GET /api/progress/:levelId` | required | 401 | 200, or 204 | 404 |
| `PUT /api/progress/:levelId` | required | 401 | 204 | 404 |
| `POST /api/progress/merge` | required | 401 | -- | -- |

`/check` still costs a visitor with no cookie exactly one statement:
`sessionUserOf` asks nothing without one. Somebody signed in pays the lookup
after grading, and the write -- three statements. The four progress routes
answer 401 before any row is read or any body parsed; a draft that is not the
viewer's is a 404 in the same words as a missing level, so nothing here says
whether a draft exists. `GET /api/progress/:levelId` answers 204 for a level
the viewer can see but has not played, which is not an error.

`GET /api/progress` hands back every row the account holds, most recently
touched first, as `PlayProgress[]`. The level list asks it once for every card
it draws.

## The merge

A browser holds progress for whoever used it, and an account holds progress
for whoever signed in. The day those are the same person, the browser's
records are offered to the account through `POST /api/progress/merge`, and
two records of one level have to become one. The rule, in a sentence: **one
record wins whole, and the other gives only its verdicts.**

First, the browser's record is **re-graded** against the answer, because
local storage is the player's own to edit. A pitch or verdict at an index
that is not a note to find (a rest, the tail of a tied run, past the end) is
dropped. Every verdict is recomputed from the answer. A claimed solve is kept
only when every note is written and right -- and a full set of right pitches
nobody ever checked is still unchecked, so a record that did not claim a solve
never gains one. A kept solve counts as at least one check, and adds a correct
verdict for every pitch, since that is what a solving check said. The clock
and the count are floored to whole numbers. The account's own row goes
through the same, which changes nothing on an honest row and counts its right
pitches by the same reckoning.

Then a winner:

| Account | Browser | Winner |
| --- | --- | --- |
| solved | solved | fewer checks; tie → less time; tie → the account's |
| solved | partial | the solved one, with its own check count |
| partial | solved | the solved one |
| partial | partial | more **correct** pitches; tie → more pitches written; tie → the account's |
| nothing | anything | the browser's |

The winner contributes its pitches, check count, clock and solve **together**.
A score is a pair -- these checks, in this time -- and taking the fewer checks
from one solve and the shorter clock from another would describe a sitting
nobody had; the same goes for an attempt, which the player continues from the
winner's pitches with the winner's tally. The loser contributes its `judged`
entries, which are facts about the answer rather than a score: the union of
both sides, keyed by (index, midi), so every guess either side tried stays
coloured on the stave.

Merging is idempotent. The same record offered twice ties on every key and
the account's side wins, which is what lets the browser offer its records
again after a failure with no harm done. The route writes every taken record
in one batch at the end, so `taken` is exactly what landed; a record that
would leave the account's row as it was is taken without a write. A level the
server does not have, a draft the viewer may not see, and a draft still
missing pitches are passed over in the same silence.

One race, accepted: a `/check` landing between the merge's read of a row and
its batch is overwritten by the merged row. The window is the width of one
sign-in landing.

What tampering with a browser's record can do, then, is bounded: it cannot
break the page or the merge (anything malformed is read as nothing), it
cannot reach another account's row or a level the player cannot see, and on
the player's own row it can flatter only the two numbers nobody can verify --
the count and the clock. Phase 6's difficulty figures can treat outliers as
they like.

## The hand-off

Nothing moves from a browser to an account without a yes, because two people
may share a browser: A plays signed in, signs out, B plays signed out, A signs
in again -- and a silent merge would hand B's records to A.

The question is asked when an account is **new to this machine**:
`localStorage["transcribe:viewer"]` holds the id of the last account this
browser was asked about, and when `/api/me` answers with a different one and
the browser holds at least one readable record, `/tunes` and `/play` open a modal
-- bring it in, or leave it here. Either answer writes the marker, so the
question is asked once per account per machine. While somebody is signed in
and records remain in the browser, the catalog's note line offers the same
two ways out without asking again: bring it into your account, or forget it
(which asks first, and deletes nothing silently). The modal is for arrival;
the line is for everything after. The profile page, when phase 4 builds it,
gets a button for the same.

After a successful merge the browser removes **every record it sent**, not
only the ones the server reports as taken: the server has answered for the
batch, and a record it skipped names a level it no longer has, which no later
merge could take either.

The account store falls back to the browser when a request fails -- a session
that ran out under the page, a server that could not be reached -- so a save
is never lost; it sits in local storage until the standing line offers it.
A 404 on a save (the level is gone) is dropped rather than filed, since it
could never be taken.

## The catalog

`/tunes` reads progress once (`GET /api/progress` for an account, one local read
per level otherwise) and draws each card's status word — Not Started (no
record, or no pitches), In Progress (pitches, no solve), Transcribed
(solved) — along with "Resume" and "Play again" in the level's box. The same
three buckets are the status cut in the filter box, as three switches rather
than one choice of four: all on by default, all of them off shows nothing,
and none of it is remembered between visits, unlike Compact, because a filter
is a question asked now rather than a way of liking the page.

## What a level's life does to progress

- **Deleting a level** deletes every player's progress on it, by the foreign
  key's `ON DELETE CASCADE`; the route touches nothing but the level.
- **Unpublishing a level** gives it a new id in place (`UPDATE … SET id`),
  and progress does *not* follow: the foreign key has no `ON UPDATE` clause,
  on purpose, because the author is about to change the music the progress
  was keyed to note by note. The route deletes the level's progress first, in
  the same batch as the move; were it to forget, the database would refuse
  the move while any row still points at the old id. A browser's copy, for
  anybody signed out, is out of reach and simply meets nothing.
- **Editing a draft's music** under the same id does not clear progress on
  it. Only the author (or an admin) can have any, and the play page skips a
  restored pitch at an index that is no longer a note.
- **Deleting an account** takes its progress with it, by the other cascade
  — and deletes every level it published, so other players' progress on
  those goes too, by the first one (`authentication.md`, "The account's
  own").
- **`share_stats`**, the account setting "count my play in public
  statistics", is honoured by every public figure (`difficulty.md`): the
  rating and upvote routes refuse writes while it is off, and every
  aggregate — the rating blend, the heart count, and the figures computed
  from *this* table (the solver count in the listing, the median solve
  times behind `GET /api/tunes/:id/stats`) — leaves out the rows of
  anybody who turned it off, at read time. The play figures also leave out
  the level's own author, whose solves say nothing about the level.

## Operating it

The statements are in one place, `PROGRESS_SQL` in `worker/routes.ts`, and
`test/migrations.test.ts` runs each of them against the real schema in
Node's SQLite, because the stand-in database the route tests use never
parses a statement and an upsert with a wrong `ON CONFLICT` would pass every
route test and fail on deploy.

To see what an account holds:

```
wrangler d1 execute transcribe --remote \
  --command "SELECT level_id, check_count, solved_at, elapsed_ms FROM progress WHERE user_id = '<id>'"
```

To wipe one account's progress on one level (say, to let somebody replay it
for a score): `DELETE FROM progress WHERE user_id = '<id>' AND level_id = '<level>'`.
Their browser holds nothing for it while they are signed in, so the level
opens fresh.
