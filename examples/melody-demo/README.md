# Melody demo (archived)

The display-only VexFlow demo that `src/` held before it became the melody
editor. Kept as a reference for rendering the sample melodies, switching between
them, and reporting `splitIntoMeasures` errors in the page.

It is **not built and not typechecked**: Vite's root is `src/`, and `tsconfig.json`
includes only `src`. The imports point at `../../src/…` so the code still reads
correctly, but running it again would mean adding a Vite `rollupOptions.input`
entry and widening the tsconfig `include`.

`renderMelody` has moved on since this was written, so reviving it means more
than fixing the imports:

- The `barWidth` and `firstWidth` options are gone. Bar widths are now derived
  from the music — each bar is measured with `Formatter.preCalculateMinTotalWidth`
  and the line's width is shared out in proportion — so the bar-width slider
  this page is built around no longer has anything to set. `availableWidth`
  replaced them, and defaults to the container's width.
- The score wraps onto a new line at every `lineBreakAfter` index instead of
  drawing all bars in one row.
- `renderMelody` returns a `MelodyRenderResult` rather than `void`. This page
  ignores the return value, so that part is harmless.
