# Parameters In Provenance Plan

## Goal

Track user-adjustable parameter changes in provenance (undo/redo and bookmarks)
so that selections and UI-bound parameters replay consistently with intent
actions.

In this context, a "parameter" is a named, reactive value defined in the view
spec (`params`) that can drive expressions, selections, and bound UI inputs.
See `docs/grammar/parameters.md`.

## Status

The core and app plumbing for parameter provenance is implemented in this
branch. The remaining work focuses on capturing selection origin metadata so
provenance can rehydrate selections from their semantic source when available.

## Remaining Work

1. Capture selection origins when a selection is created from a datum.
2. Persist origin info in `paramChange` payloads alongside literal values.
3. Provide origin metadata for interval endpoints (`x`/`x2`, `y`/`y2`) using a
   channel-keyed shape that can later be extended beyond positional channels.
4. Add tests for origin capture and restore fallbacks.

## Implementation Notes

- Origin payload shape:
  `{ type: "datum", view: ViewSelector, keyField, key, intervalSources? }`
- `intervalSources` should be a channel-keyed record with `start`/`end` fields
  per channel (for example `x` + `x2`, `y` + `y2`).
- If origin resolution fails during restore, fall back to literal values and
  warn the user.

## File Pointers

- Param provenance bridge: `packages/app/src/state/paramProvenanceBridge.js`
- Param action labels: `packages/app/src/state/paramActionInfo.js`
- Selection helpers: `packages/core/src/selection/selection.js`
- Collector key lookup: `packages/core/src/data/collector.js`
- Selector helpers: `packages/core/src/view/viewSelectors.js`
