# transcribe

## Never read generated output

`dist/` `dist-test/` `dist-web/` `dist-worker/` `out/` `node_modules/` are build
artifacts. Don't read, search, or edit them — read the sources instead: `src/` for
`dist/` and `dist-web/`, `test/` for `dist-test/`, `worker/` for `dist-worker/`.
Edits there are always wrong; the next build overwrites them. Sole exception:
diagnosing a build or bundling mismatch. Say so when doing it.

`worker-configuration.d.ts` is generated too, by `npm run cf-typegen` out of
`wrangler.jsonc`. Rerun it after changing a binding rather than editing it.

## Prefer `undefined` over `null`

Absent values are `undefined`. Use `null` only where an API requires it.

## Check the VexFlow docs, don't recall them

For any VexFlow API signature or behaviour question, consult the VexFlow wiki,
examples, docs or GitHub rather than relying on memory — the API changed across
major versions and training data may reflect an older one. This project is on
VexFlow 5.

Its `.d.ts` files do not always tell the truth either: `Stem.getBoundingBox()`
is declared but throws `NotImplemented`. When behaviour matters, check the
implementation in `node_modules/vexflow/build/esm/src/` — one of the few reasons
to read `node_modules/`, and say so when doing it.

## Test-first design

Write tests first, then code.
Consult previously-existing tests for reference on how to name tests.

## The accounts work follows a roadmap

`docs/roadmap.md` holds the phases of the accounts and ownership work, what
has been decided and why, and which phase is next. Read it before touching
auth, levels or migrations, and update its status table when a phase lands.
`docs/authentication.md` is the reference for how sign-in and ownership work.

## Never edit an applied migration

A schema change is a new numbered file in `migrations/`. Editing one that has
been applied changes nothing in any database and leaves the file lying about
what is there — it happened once, and the first real deploy met a column that
was not there. `test/migrations.test.ts` runs the files against real SQLite
for this reason. Apply with `npm run db:migrate:local` and
`db:migrate:remote`; for an additive change, migrate remote before deploying
code that needs it.
