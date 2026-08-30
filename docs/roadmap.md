# Accounts roadmap

What the accounts and ownership work is, what has been decided about it and
why, and where it stands. The reference for *how* sign-in and ownership work
is `authentication.md`; this is the plan and the record. A session picking
the work up should read this first, then the phase it is continuing, then
update the status table when a phase lands.

## Status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Sign in with Google; sessions; `/api/me` | Shipped 2026-08-20 (`dc0528e`) |
| 2 | Levels have owners; drafts and publishing; `/mine`; sign-in-to-save | Shipped 2026-08-21 (`4b81daf` server, `c1b9c1c` client) |
| 3 | Progress kept on the server, per account; merge offered at sign-in; filters on `/` | Shipped 2026-08-21 (`3b6d72e` server, then client) |
| 4 | Names and bylines, author-set difficulty, the profile page (name, settings, this browser's progress, deletion), the privacy page | Shipped 2026-08-21 (`9aeb89d` server, then client) |
| 5 | Admin tools beyond ownership bypass: the pencil, Unpublish and the trash on every card of `/` | Shipped 2026-08-22; no admin page, by decision |
| 6 | Difficulty from solvers' ratings blended with the author's word (`share_stats` honoured at read time), peppers and the stepper, the range filter, `/about`; hearts, the grown-up solved box, solver counts and median times | Difficulty committed 2026-08-25 (`177c17b`); hearts and play figures built 2026-08-25; error reports remain |

Known rough edges carried forward (not bugs, design not yet done): the
details box loses typed words if the server refuses; the editor's setup page
(before any note) is not stashed across a sign-in; the nav's visual design.

## Settled decisions

Each is a decision, not a guess; revisit only with a reason.

**Sign-in.** Google only, hand-rolled OIDC authorization-code flow with PKCE
and `state`; no auth library, no Google script on the page. Passkeys are the
eventual second method; `users` is shaped for one. Accounts key on
`google_sub`, never email; the email is stored, refreshed each sign-in, and
required to be `email_verified`. Sessions are 32-byte tokens in an
HttpOnly/Lax/Secure cookie with only the SHA-256 stored; thirty days, sliding
in both the row and the cookie. Admin is `users.is_admin`, set only by hand
(`wrangler d1 execute … WHERE google_sub = …`), never by any route, never by
email. The Google URL carries `prompt=select_account`. The button is drawn as
Google's branding rules require. Signing in returns to the page you were on
(`?next=`, validated twice); signing out goes home.

**Levels.** Every level has an owner (`owner_id NOT NULL`) and a status,
`draft` or `published`. A new level is a draft, private to its owner (and
admins): the listing never names it, `/puzzle` and `/check` answer 404 to
anybody else. Publishing requires every note pitched (a CHECK, not only a
sentence) and freezes the music, key, meter, bars, clef, video and marks; a
published level takes edits to its title, subtitle, instructions and difficulty only,
judged by whether the music *differs* (a body with no melody means
unchanged). Unpublishing returns it to a draft under a **new id**, because
players' progress is keyed to an id note by note and the old one must meet
nothing rather than the wrong answer. Authorization answers: 401 signed out
(before the body is read), 403 for a stranger on a published level, 404 for a
stranger on a draft. Published levels are playable by anybody with no
session lookup; the lookup happens only once a row turns out to be a draft.

**The pages.** `/` is the public catalog, "Public Levels" (for an admin only,
every card carries the details pencil, Unpublish and the trash); `/mine` is
the author's list, "My Transcriptions" (pencil to the editor for a draft, to
a details box for a published level; Publish/Unpublish as a worded button on
the card, greyed with its reason while a draft is unfinished or unrated;
trash). What a card
says about itself is one word on its first line rather than a badge over its
picture: Not Started / In Progress / Transcribed on the catalog, from the
viewer's progress; Unfinished / Complete / Published on the author's page,
from the level's own columns (`level-status.ts`). Grey for nothing done,
orange for under way and for public, green for finished; indigo is the
byline's, where it says a level is yours. A card on the author's page
opens the *editor* — a draft is work, and there is nothing to decide about
your own — except a published one, whose music is frozen and which opens its
box like the catalog's. The catalog's cuts live behind a funnel button
(statuses, a difficulty range, only what you have hearted, and whether your
own levels are among everybody's); the author's page shows its three status
switches in the open. Neither is remembered between visits; Compact is.
Save stays in the editor and gives a new transcription its
address by `replaceState`. Sign-in-to-save stashes the whole editor in
`localStorage` (`transcribe:draft`) across the redirect: one-shot, one
address, ignored after a day, with an `intent` of `save` (from the button)
or `keep` (from the nav). The nav is built by one module from one list, the
current page marked.

**Names and deletion (phase 4).** Every card says "by ⟨name⟩": a name is
minted at sign-in for any account without one (two words, a number when
taken), chosen on the profile page, and shown as Anonymous when the author
asks. **Deleting an account deletes everything** it made, published levels
included — reversing the earlier "keep them, anonymized": the author owns
the work, the site holds no licence, and somebody who published something
they should not have must be able to take it down by leaving. The
"keep my progress on this machine" opt-out was dropped (a browser's records
carry no account id and would mix with a signed-out player's) in favour of
`share_stats`, "count my play in public statistics", stored now for phase 6
to honour. The author-set difficulty — half a star to five, in halves,
stored as an integer count — was pulled forward from phase 6 so every card
has the same shape; `src/shared/difficulty.ts` is the one function that
decides what is shown, and phase 6 changes only its body.

**Still open** (decide when the phase needs it): whether a daily level
mechanic is coming (streaks presuppose one); dark mode is a per-machine
preference, not an account one. Wanted eventually, recorded 2026-08-25:
the catalog loads its first N levels and fetches more on scroll with a
loading mark, which moves or re-scopes the client-side filters (they are
pure functions so they can). (Also once listed here, since built: the
solved box's actions row and thumbs-up, and the median play figures with
their small-count floor — see "Phase 6, as built". Ratings resetting on
republish was settled by mechanism: the new id starts from zero.)

## Phase 3, as built

`progress.md` is the reference. The `progress` table (migration 0004) is
`PlayProgress` as a row, keyed `(user_id, level_id)`, cascading on delete from
both tables and deliberately not following an unpublished level's new id —
unpublish deletes the level's progress first, in one batch with the move.
**The server owns `check_count` and `solved_at`** (`/check` counts and
stamps, for whoever carries a cookie; a visitor without one still costs one
statement) and the page owns the clock, the pitches and the verdicts
(`PUT /api/progress/:id`). A solved row is finished: a later check writes
nothing. Three decisions moved from the sketch above this once said:

- **Merging is opt-in**, never silent — two people may share a browser. The
  page asks once per account per machine (`transcribe:viewer` marker), and
  the catalog's note line offers the same afterwards.
- **The merge rule is "winner takes the score whole"**, not "larger elapsed":
  solved beats partial; solved vs solved → fewer checks, then less time;
  partial vs partial → more correct pitches, then more written; ties go to
  the account; the loser gives only its verdicts. A browser's record is
  re-graded against the answer before any of it is believed. Idempotent.
- **The elapsed clock stays the page's**, as planned; no time comparisons
  until it moves server-side.

On the client: the account store (`account-progress.ts`) falls back to
local storage when a save or read cannot reach the server, so nothing typed
is lost; the hand-off (`handoff.ts`, drawn by `merge-offer.ts`) asks on `/`
and `/play` and stands as a line under the catalog afterwards; the catalog
reads progress with one request (`readMany`) and filters All · Unplayed ·
In progress · Solved, not remembered between visits.

Known rough edges carried forward from this phase: a merge and a check
landing in the same instant (the merged row wins; the window is one sign-in
landing); `/mine` shows neither the hand-off nor the filter, by design.

## Phase 4, as built

`authentication.md` ("The account's own") is the reference for names and
deletion. Server side (migration 0005, additive): `chose_username`,
`anonymous_author`, `share_stats` on `users`; `difficulty_half` on
`transcriptions`; names minted at sign-in; every level response carries
`author` (a correlated subselect on `users`, honouring `anonymous_author`)
and `authorDifficulty` (stars, from the halves); difficulty is one of the
details, so a published level's details box can change it;
`GET /api/username`, `PATCH /api/me`, `DELETE /api/me`.

On the client: every card has the same shape — picture, a row with the
difficulty at the left (`ui/difficulty.ts`, the one drawing; a "?" star for
unrated) and the tools at the right, title, subtitle, "by ⟨name⟩" — and the
level box and the play bar carry the byline too. The half-star picker
(`ui/star-picker.ts`) sits in the editor's details panel and the details
box. The nav corner's name is the link to `/account`: the name with a live
availability check (`ui/name-check.ts`), the two settings as switches, this
browser's progress with the same hand-off as the catalog, and deletion
behind a question that lists what goes. `/privacy` is prose in the markup,
linked from a footer on every page. `/mine` says once, while the name is a
minted one, that it was picked.

Known rough edges carried forward: the privacy page is a draft for Jason to
review before it is relied on; an account from before names were minted
shows its email in the corner until its next sign-in; `chose_username` is
set by any save on the account page, so keeping the minted name by saving
it counts as choosing it.

## Phase 5, as built

The moderation view this phase once promised was dropped, by decision: the
site's moderation is the catalog itself. An admin on `/` has, on every
card, the three tools the author has on `/mine` for a published level — the
pencil to the details box, Unpublish and the trash — and nothing else
anywhere. `cardPlan` in `src/ui/level-card.ts` is the one place that says
so; the server needed nothing, since an admin already passed every
ownership check (`ownerOrAdmin` in `worker/routes.ts`), and the list module
already wired each tool to its route on whichever page it draws.

An admin's Unpublish is the author's Unpublish: the level leaves the catalog
and returns to its author as a draft under a new id, every player's
progress on it is deleted, and the author may republish it. Delete is the
only tool that sticks. The catalog's byline honours `anonymous_author` for
an admin as for anyone, so tidying the catalog does not see through
Anonymous; the database does, by hand, which is where admin lives anyway.

Deliberately not built, and not planned: an `/admin` page, a route listing
everybody's drafts (the comment on `/api/mine` still says there is no call
for one), a takedown that an author cannot republish past, a users list. If
a moderation view is ever wanted, the seams are `createLevelList`'s `page`
switch, a new page input in `vite.config.ts`, a `planNav` handed the user
rather than a boolean, and an admin-only route beside `/api/mine`.

## Phase 6, as built (all but error reports)

`difficulty.md` is the reference. The "from play data" sketch above was
revisited in planning, on purpose: no regression, no implicit play-stat
term — at this site's scale a model fitted to a handful of plays is noise
wearing a formula. What shipped is one weighted average, explainable on
`/about` in three sentences: the author's word counts as four votes
(`DIFFICULTY.authorVotes`), each rating from a solver counts as one, and
the shown figure is the average rounded to the nearest half. A play-data
term can join later as more pseudo-votes in the same average, once there
are enough solves for a median to mean anything.

**Nothing derived is stored** — the decision the rest follows from. The
tables hold raw facts only: `difficulty_half` (the author) and `ratings`
(migration 0006, one row per player per level, shaped like `progress` for
0004's reasons). The listing aggregates a count and sum per level in
correlated subselects joining `users` on `share_stats = 1`, so an opt-out
leaves every figure at the next read (retroactively), deletion cascades,
and unpublish deletes the rows in its batch — the FK, with no ON UPDATE
CASCADE, refusing the id move as the backstop. Republish is a new id and
zero ratings, which settled "do ratings reset" by mechanism.

Who may rate is the route's whole design: signed in, sharing statistics,
on a published level they solved and did not write — the author's word is
the anchor, so an author rating their own level would be counted twice.
One rating each, changed by rating again. Publishing now *requires* the
author's word, and the "?" unrated drawing left the codebase with it; 0006
gave 2.5 to anything published before the rule, and the editor starts
every new level there, so only a stale local draft can still lack one.

On the client: the stars became chili peppers (Phosphor's `pepper`,
outline and fill weights of one silhouette, MIT, inlined in `icons.ts`),
the border always visible and the fill clipped to none, half or full.
Entering a difficulty became a +/− stepper in half steps — by decision,
never clicking on the pepper row — used by the details panel, the details
box and the solver's prompt alike; there is no way to clear it. The prompt
lives in the level's box, which the solving check now opens a beat after
the burst; the box also says "from N ratings", the one place the count
shows. The catalog gained a from–to range filter over the *blended*
figure, client-side like the progress filter, ANDed with it. `/about`
explains the model in prose Jason can write over; `/privacy`'s "Public
figures" section was rewritten to describe what actually shipped.

The second slice (2026-08-25, same conversation) grew the rest, error
reports aside. Hearts: an `upvotes` table (0007, ratings' shape minus the
word), the same refusal ladder minus a body, a toggle whose filling heart
is its own feedback, and Phosphor's `heart`/`heart-fill` and
`check-circle` joining the borrowed glyphs. The solved box became a real
one: a cheer on the solving open, the difficulty proposal now behind
explicit Save/Remove buttons (the stepper alone sends nothing), the heart
beside the figures, Keep playing / Level select as the ways onward — and
for the author, no player pathway at all but a note and the Edit details
door, since their word is the anchor and is set there. Cards' difficulty
row gained the figure back beside the peppers ("1.5", "4.0"; the stepper
stays number-free so its buttons hold still), the heart count and the
solver count, zeros included. The box adds the two medians from
`GET /api/levels/:id/stats` — sharing players' solves only, never the
author's own, each figure absent (a dash) under `STATS_FLOOR = 3` — with
`medianOf` in `src/shared/stats.ts` and the rows from
`PROGRESS_SQL.solveTimes`. `difficulty.md` covers all the figures now.

## How the work is done

Tests first (`CLAUDE.md`). Route tests use `test/helpers/stub-database.ts`
(answers routed by statement text) and `test/helpers/signed-in.ts`
(`asOwner()`, `asStranger()`, `asAdmin()`); migration files are run against
real SQLite in `test/migrations.test.ts`. A schema change is a new numbered
migration, never an edit to an applied one. For an additive migration:
`npm run db:migrate:remote`, then `npm run deploy`, in that order. Each phase
is planned in conversation first — questions, concerns, ambiguities — then
built, clicked through locally by Jason, committed in the repository's
commit-message style, and deployed.
