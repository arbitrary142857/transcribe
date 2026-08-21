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
| 3 | Progress kept on the server, per account | Next |
| 4 | Profile page: username, account deletion, privacy page | — |
| 5 | Admin tools beyond ownership bypass | Mostly folded into 2; a moderation view remains |
| 6 | Difficulty, thumbs-up, error reports | — |

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
published level takes edits to its title, subtitle and instructions only,
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

**Still open** (decide when the phase needs it): whether cards show "by
⟨username⟩" (and so when the choose-a-username prompt ships); whether a daily
level mechanic is coming (streaks presuppose one); whether ratings reset on
republish (the new id implies yes); account deletion keeps published levels
anonymized (decided) but the exact cascade for progress and ratings is phase
4's to write down; dark mode is a per-machine preference, not an account one.

## Phase 3, as planned so far

A `progress` table mirroring `PlayProgress`: `(user_id, level_id, elapsed_ms,
check_count, solved_at, pitches JSON, judged JSON, updated_at, PRIMARY KEY
(user_id, level_id))`, referencing both tables (unpublishing must then carry
progress across or delete it — it deletes, by design). A network-backed
`ProgressStore` for signed-in visitors (the interface is already async for
this). Merging a machine's local progress into the account at sign-in:
solved wins, else the record with more pitches; the larger elapsed time; the
union of verdicts. `check_count` counted on the server, which makes it honest
in a way the client's clock is not; no cross-player time comparisons until
the clock moves server-side. The solved/in-progress filters on `/`.

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
