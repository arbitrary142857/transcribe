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
| 5 | Admin tools beyond ownership bypass | Mostly folded into 2; a moderation view remains |
| 6 | Difficulty from play data (the author's word shipped in 4; honour `share_stats`), thumbs-up, error reports | — |

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

**The pages.** `/` is the public catalog (tools for admins only); `/mine` is
the author's list (Draft badge; pencil to the editor for a draft, to a
details box for a published level; Publish/Unpublish as a worded button on
the card; trash). Save stays in the editor and gives a new transcription its
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
mechanic is coming (streaks presuppose one); whether ratings reset on
republish (the new id implies yes); dark mode is a per-machine preference,
not an account one.

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
