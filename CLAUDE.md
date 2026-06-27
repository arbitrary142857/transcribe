# daily-transcribe

## Never read generated output

`dist/` `dist-test/` `dist-web/` `out/` `node_modules/` are build artifacts. Don't
read, search, or edit them — read the sources instead: `src/` for `dist/` and
`dist-web/`, `test/` for `dist-test/`. Edits there are always wrong; the next build
overwrites them. Sole exception: diagnosing a build or bundling mismatch. Say so
when doing it.

## Never use `null`

Absent values are `undefined`. Convert `null` from DOM and library APIs at the
boundary with `?? undefined`.
