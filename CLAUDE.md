# daily-transcribe

## Never read generated output

`dist/` `dist-test/` `dist-web/` `out/` `node_modules/` are build artifacts. Don't
read, search, or edit them — read the sources instead: `src/` for `dist/` and
`dist-web/`, `test/` for `dist-test/`. Edits there are always wrong; the next build
overwrites them. Sole exception: diagnosing a build or bundling mismatch. Say so
when doing it.

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
