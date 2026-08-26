# How difficulty works, and the figures beside it

The reference for the figures every level card shows — the difficulty
blend, the hearts, the solver count and the median times: where each comes
from, who may move it, and how it forgets. `roadmap.md` records why it is
this way; the About page (`/about`) says it in a player's words.

## The model, whole

A level's displayed difficulty is one weighted average, worked out in
`src/shared/difficulty.ts` (`displayedDifficulty`, the one function that
turns what is known into what is shown):

```
halves = (4 · authorHalf + Σ ratingHalves) / (4 + ratingCount)
shown  = halves rounded to the nearest half
```

The author's word counts as **four votes** (`DIFFICULTY.authorVotes`); each
qualifying solver rating counts as one. Zero ratings means the author's
word exactly; four solvers pull even with the author; a dozen mostly own
the figure. The rounding happens once, in that function, so the number
printed and the peppers drawn cannot disagree.

Everything is stored in halves — an integer 1–10 — in two places only:

- `transcriptions.difficulty_half`: the author's word. Publishing requires
  it (`POST /api/levels/:id/publish` refuses without it), a published
  level's details edit may move but not clear it, and migration 0006 gave
  the middle of the scale (5 halves) to any level published before the
  rule. The editor's stepper starts every new level at 2.5, so an unrated
  draft is a legacy case, drawn as nothing.
- `ratings` (migration 0006): one row per (player, level) — user_id,
  level_id, half, created_at, updated_at, PK (user_id, level_id). The
  upsert (`RATING_SQL.rate`) moves `half` and `updated_at` and keeps
  `created_at`.

**Nothing derived is ever stored.** The listing splices two correlated
subselects into `LEVEL_COLUMNS` (`worker/routes.ts`) that COUNT and SUM the
level's ratings at read time, joining `users` on `share_stats = 1`. The
pair travels on every level summary as `ratingCount` / `ratingHalves`
(absent when nobody has rated), and both the worker and the page compute
the shown figure through the same shared function. The client-side
difficulty filter cuts by that same blended figure, never the author's
word alone.

## Who may rate, and when

`PUT /api/levels/:id/rating` (body `{ stars }`, halves 0.5–5) refuses, in
order: an id that could not name a level (404, nothing asked); nobody
signed in (401, before the body is read); a body that is not a rating
(400); a level that is not there — or a draft, to a stranger (404, the
same words); a draft to its own author or an admin (409); the level's
owner (403 — the author's word is already the anchor); an account with
`share_stats` off (403 — the rating would be stored only to be ignored);
somebody who has not solved it (`progress.solved_at`, 403). One rating per
player per level, changed by rating again, taken back by
`DELETE …/rating`; `GET …/rating` answers the caller's own (204 for none).

The prompt (`src/ui/rating-prompt.ts`) mirrors those gates client-side and
is simply absent for anybody the server would refuse. It lives in the
level's box: opened by the solving check (a beat after the burst), the play
bar's info button, and any solved level's card. The stepper opens
provisional at 2.5 — or at the rating already given, fetched after the box
draws — and every press PUTs the new figure.

## Hearts and play figures

The same read-time discipline, three more figures:

- **Hearts** (`upvotes`, migration 0007): one row per (player, level),
  nothing but the pair and its moment. `PUT /api/levels/:id/upvote` walks
  the rating route's refusal ladder minus the body (the request is the
  whole statement); the insert conflicts into silence, so pressing twice
  is one heart; `DELETE` takes it back; `GET` answers `{ upvoted }` for
  the button to open filled or not. The card and the box count them
  through a `LEVEL_COLUMNS` subselect joined on `share_stats = 1`.
- **Solver count**: a subselect over `progress` rows with `solved_at`,
  joined on `share_stats = 1` **and excluding the level's own author** —
  the author knows the answer, so their solves say nothing about the
  level. (Ratings and upvotes never hold the author's rows; their routes
  refuse them.)
- **Median times**: `GET /api/levels/:id/stats` answers
  `{ medianSolveMs?, medianFlawlessMs? }`, computed in the worker from
  `PROGRESS_SQL.solveTimes` (sharing players' solves, never the author's)
  and `medianOf` in `src/shared/stats.ts`. Flawless means solved on one
  check, the count the server froze at the solve. **Each median is absent
  below `STATS_FLOOR = 3` qualifying solves** — a "median" of one or two
  playthroughs is those players' own times published — and the box draws
  the absence as a dash. Visibility follows the level: published figures
  are everybody's with no session lookup; a draft's are its author's.

The solved box is where a player speaks: the difficulty proposal (a
stepper with explicit **Save proposal** / **Remove proposal** buttons —
nothing reaches the database but those) and the heart (one press, the
filling heart is the feedback). The author gets neither; their box says
the level is theirs and opens the details box, where their word — the
blend's anchor — is set.

## How it forgets

Every path out is the absence of stored aggregates:

- **Opting out**: flipping `share_stats` off removes that account's
  ratings from every average on the next read, retroactively; flipping it
  back restores them. The rating route also refuses new writes while off.
- **Deleting an account**: the `ratings` rows cascade away with it.
- **Unpublishing**: the unpublish batch deletes the level's ratings,
  upvotes and progress before reissuing the id; each FK (no ON UPDATE
  CASCADE) refuses the move if a route ever forgets. Republished, the
  level is a new id with zero of everything: the author's word alone,
  which is the truth about music the author may just have changed.

## The drawing

`src/ui/difficulty.ts` draws five chili peppers (Phosphor Icons' `pepper`,
outline and fill weights of one silhouette, inlined in `src/ui/icons.ts`
with the MIT notice). The border is always visible; the fill silhouette is
laid *under* the raised outline and clipped to 0/50/100% of the glyph's
width. Entering a difficulty — the author's in the details panel and box,
the solver's in the prompt — is `src/ui/difficulty-stepper.ts`: minus,
peppers and the number, plus, in half steps, clamped to the scale, with no
way to clear (a published level must keep a word; a solver changes their
mind rather than unsaying it).

## What proves it

`test/migrations.test.ts` runs migration 0006, every `RATING_SQL`
statement and the spliced `LEVEL_COLUMNS` against real SQLite — including
the share_stats exclusion and the FK backstop. `test/api-rating.test.ts`
holds the route to the refusal order above; `test/api-levels.test.ts` to
the publish requirement and the unpublish batch; `test/difficulty.test.ts`
to the blend; `test/level-filter.test.ts` to the range cut.
