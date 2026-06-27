# daily-transcribe

## Never read generated output

`dist/` `dist-test/` `dist-web/` `out/` `node_modules/` are build artifacts. Don't
read, search, or edit them — read the sources instead: `src/` for `dist/` and
`dist-web/`, `test/` for `dist-test/`. Edits there are always wrong; the next build
overwrites them. Sole exception: diagnosing a build or bundling mismatch. Say so
when doing it.

## Prefer `undefined` over `null`

Absent values are `undefined`. Use `null` only where an API requires it.
