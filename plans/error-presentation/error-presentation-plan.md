# Presenting runtime error locations

## Goal

Show the existing specification location beside a runtime error in the browser
and console. Keep Core's default display simple; let Playground provide a more
readable card using its existing error callback and editor diagnostics.

Implementation is authorized. The user explicitly requires a separate request
before any further push. Leave the work local until delivery is requested.

## Findings

- `utils/specError.js` already attaches `specLocation: { origin, path }` to
  native errors. `getSpecErrorLocation()` finds it through causes. No additional
  error class or location bookkeeping is necessary.
- `embedError.js` stringifies launch failures for the default message box.
  `GenomeSpyBase.#reportError()` independently stringifies runtime failures and
  logs only `reason.stack`, dropping structured location context from that log.
- Playground's `onError` only updates CodeEditor diagnostics. Returning true
  already allows a host to replace Core's default error UI, including failures
  delivered after failed-launch cleanup.
- Nonfatal eager/lazy failures use `dataLoading.errorLocation` instead of
  `onError`. `LoadingIndicatorManager` currently copies only `entry.message` into
  visible loading failures. Eager URL processing logs an inner warning; lazy
  interval failures have no contextual console log at their final catch.
- Playground logs rejected embeds again in its outer catch. Contextual logging
  should use the existing reporting boundaries rather than add another logger.
- Core also sets a root loading-error indicator after a fatal callback, even
  when the host returned true. A custom card must not gain a second fatal error
  display through this independent indicator path.

Relevant architecture: Core's `docs/architecture/views-and-dataflow.md` and
the current editor integration contract in `docs/api/editor-integration.md`.

## Proposed decisions

1. Keep native errors, messages, stacks, causes, and `SpecLocation` unchanged.
   Add a small internal location formatter shared by Core's presentation paths.
   Core treats the origin as an opaque identifier, displaying its value and
   the relative property path separately. It must not assume all origins are
   JSON Pointers. An empty origin is valid and identifies the root declaration.
2. Add the location to Core's existing default error text when available. Use
   the same presentation for setup and runtime failures, preserving existing
   ViewError context as a fallback. No location means the current message.
   Let the message box or host own fatal UI; clear the separate root loading
   indicator instead of publishing the same fatal error there as well. Actual
   data-source failures retain their local indicators.
3. Log a readable location label alongside the original Error object rather
   than just its stack string. Preserve the existing launch/runtime duplicate
   guards. Eager and lazy catches can log the original caught error once with
   location context; remove the eager inner warning that would duplicate it.
   Do not mutate `error.message`, override `toString`, or rewrite stacks.
4. Include `errorLocation` in the existing track-local indicator's displayed
   context. Keep the loading snapshot's message and structured location separate.
   A failed track stays local and does not trigger a fatal Playground overlay.
5. Let Playground's existing `onError` render a small Lit error card and return
   true. Show the full message and a separate monospace specification path, with
   bounded width, wrapping, and scrollability. Playground knows its origins are
   JSON Pointers and can append escaped relative segments to display, for
   example, `/layer/1/transform/4/width`. Use the existing editor underline.
   The user also requested a "Show in editor" action beside the path. Resolve
   its range through the existing JSON worker and location lookup, then select,
   focus, and scroll to the value. Discard the result if the document or embed
   attempt changes while the worker resolves it.
6. Reuse the current embed-attempt and document guards when updating the card.
   Clear it before the next embed; obsolete failures must not restore it. Use
   the callback's container, which is safe after launch cleanup. Do not attach
   UI nodes to an instance that has just been destroyed.
7. Catch an embed rejection at the embed call, where its error is already
   reported through Core. Keep the outer catch for other Playground failures.
   This removes duplicate console output without adding error markers or flags.

Precise locations still require `getSpecOrigin`; Playground already provides it.
Imported/generated declarations without an authored location retain ordinary
errors. The path identifies the failing reference, not an upstream declaration
that the user may have intended to produce that field.

## Established patterns and alternatives

The [Console Standard](https://console.spec.whatwg.org/#printer) supports logging
multiple values and leaves their presentation to the browser. An explicit text
label plus the original Error makes context visible without depending on whether
DevTools happens to expand custom properties. [CodeMirror's lint example](https://github.com/codemirror/website/blob/main/site/examples/lint/index.md)
keeps diagnostic ranges and messages separate from their editor presentation;
the current Playground integration already follows that pattern. No external
implementation code is copied.

Rejected alternatives: parsing messages to recover locations; adding a general
diagnostics hierarchy; making Core interpret opaque origins as JSON Pointers;
putting line numbers into Error objects; rendering fatal cards for data-loading
failures. Defer line/column labels, typo suggestions, and structured
available-field lists until separately requested. Existing messages can wrap
without introducing another error metadata contract. The requested editor-jump
action is included.

## Implementation milestone

Tentative commit: `feat: show specification context in runtime error displays`.

- [x] Share location text formatting across setup/runtime presentation and
      contextual console logging while retaining native error identity.
- [x] Show source processing locations in existing loading indicators and log
      eager/lazy failures at their final catch boundaries without duplication.
- [x] Add Playground's scoped error card through `onError`; preserve editor
      diagnostics and stale-attempt handling, including the existing rejection
      logging boundary.
- [x] Add "Show in editor" beside located errors, reusing the JSON AST lookup
      without depending on cached lint diagnostics. Verify selection, focus,
      scrolling, formatting changes, and in-flight edits.
- [x] Update the existing feature changeset and editor integration guidance.
- [x] Verify located/unlocated errors, opaque and root origins, wrapped causes,
      host UI suppression, cleanup, and independent track failures. Reuse real
      embed/editor tests; avoid tests that only mirror formatting internals.
- [x] Browser-check the bubble health/income annotations example after changing
      its formula output to `collisionWidthh`: the error identifies the downstream
      formula at `/layer/1/transform/5/expr` and stays in the local loading
      indicators. Check fatal expression errors and correction with Canvas,
      WebGL, and WebGPU; check a failed lazy track, formatting, rapid correction,
      and long-message wrapping in a narrow pane.
- [x] Measure the changed production lines against the current baseline; remove
      duplicated display/logging paths before accepting additional machinery.

## Verification results

- Full unit suite: 512 files passed; 4,696 tests passed, one skipped, two todo.
- Playground's own Vite configuration: nine files, 31 tests passed.
- All workspace TypeScript checks, lint, Playground production build, formatting,
  and `git diff --check` passed. Release policy checks passed; the existing minor
  changeset keeps the fixed release group on the planned 1.2.0 release.
- Browser checks confirmed the fatal card's location, editor underline,
  correction, and healthy re-embed with Canvas, WebGL, and WebGPU. Formatting
  retained the located error; rapid correction left no obsolete card.
- The real `collisionWidthh` typo remained a nonfatal processing failure with
  location context in the existing indicators and one contextual console report.
  A missing BigWig URL produced a loading entry and one local indicator without
  a fatal card. The browser also logs its own HTTP failure for the request.
- The card was inspected at 1280x900 and 800x650. Long unbroken messages wrapped
  without horizontal overflow; the card scrolled within the visualization pane.
- The editor action was checked at 1280x900 and 450x650. Clicking and keyboard
  activation selected the missing value at `/vconcat/1/encoding/x/field`, focused
  the editor, and scrolled it into view. Formatting retained navigation; the
  editor tests reject an in-flight result after document changes.
- Production JavaScript adds 157 net physical lines against HEAD, including
  the two new presentation modules and worker navigation support. Source CSS
  adds 85 physical lines. These counts include comments and blank lines and
  exclude tests, docs, and generated CSS duplication. Shared formatting replaces
  the duplicated setup/runtime formatting; no new error metadata or state
  registry was added.

Separate follow-up: a failed WebGL launch can dispose resources before the
default font bitmap finishes, causing WebGL warnings and an unhandled font-load
rejection. The font manager and renderer resource paths are unchanged by this
work. This does not replace the original located error or leave the card after
correction. Do not broaden this presentation change into font lifecycle work.

Implementation and verification are complete. Committing is authorized;
no push or PR update is authorized.

## Risks and acceptance

The main risks are duplicate logging, stale custom UI after correction, and
turning a local loading error into a global failure. Preserve the current
reporting routes and lifecycle guards. Core must display opaque origins safely
as text; Playground must escape appended JSON Pointer segments.

Acceptance: available location context is visible in the UI and console, the
original Error remains inspectable, and existing editor highlights and loading
fatality remain unchanged. No new runtime validation or recovery is included.
