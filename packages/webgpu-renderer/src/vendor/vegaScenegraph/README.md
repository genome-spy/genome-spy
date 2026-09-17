# Focused Vega Scenegraph adaptation

The SVG path parser and arc conversion are adapted from
[`vega-scenegraph`](https://github.com/vega/vega/tree/main/packages/vega-scenegraph/src/path)
at revision `79aa7d9de7b09604c5f881a09fd528d2b561d12f` (retrieved
2026-09-01).

Source mapping:

- `parse.js` is adapted from `src/path/parse.js`.
- `arc.js` is adapted from `src/path/arc.js`, with constants inlined and caches
  removed.
- `toGlyphPath.js` implements the command-state conversion used by
  `src/path/render.js`, targeting the renderer's focused path commands instead
  of a Canvas context.

Only the proof-of-concept path conversion is included. The upstream
BSD-3-Clause license is preserved in `LICENSE`.
