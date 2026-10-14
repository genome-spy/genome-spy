---
name: debug-genomespy-web
description: Debug GenomeSpy specifications, UI, and rendering in a real browser. Use for runtime specification or data-loading failures, interaction bugs, rendered output, or browser console and network inspection.
---

# Debug GenomeSpy in a browser

- Prefer a focused Vitest test when the behavior does not require a browser.
- For browser behavior, use Playwright or an interactive browser. Open
  `http://127.0.0.1:8080/`; start `npm start` from the repository root if the
  development server is not running. Development routes live in package
  `vite.config.js` files and the root `devServerRoutes.mjs`.
- Reproduce the smallest relevant flow. Inspect visible output, console errors,
  and network behavior as appropriate. After a fix, repeat the reproduction and
  add durable automated coverage when the behavior warrants it.
- For specification failures, validate structure against the
  appropriate Core or App JSON Schema first; see
  [schema-assisted editing](../../../docs/grammar/index.md#schema-assisted-editing).
  Runtime diagnostics cover checks that depend on execution, such as whether an
  encoding field exists in the loaded data.
- Check `embed` rejections, `onError`, and entries with `status: "error"` in
  `api.dataLoading.getSnapshot()` before traversing internal dataflow objects.
  Successful embedding can still contain failed data sources.
- For validation or captures that require loaded data, await
  `api.awaitVisibleLazyData(signal)` with a bounded cancellation signal. Handle
  its rejection and inspect the loading snapshot even when the wait fails.
  This covers current visible requests, not hidden tracks or future viewports.
- Use `getSpecErrorLocation(error)` for caught/reported errors. For loading
  entries, prefer `errorLocation`; fall back to `origin` to identify the data
  declaration. Locations require the host's `getSpecOrigin`
  mapping. Playground supplies this mapping and underlines affected declarations.
  See [editor and agent integration](../../../docs/api/editor-integration.md) for
  the location contract and revision workflow. Preserve error messages when no
  location is available.
- For a focused Core WebGL smoke check, run
  `npm -w @genome-spy/core run capture:screenshots -- --check <example paths>`.
  It detects rendering errors, not pixel correctness. Reserve
  `npm run smoke:examples` for broad coverage because Playwright is slow.
- For live hierarchy, names, scales, parameters, or dataflow, read
  [inspector snapshots](references/inspector-snapshots.md). The Inspector UI
  presents the same snapshots. The reference also explains when to use SVG or
  screenshots to inspect actual rendering.
- To crop one rendered view or subtree from the live canvas, read
  [focused view capture](references/view-capture.md).
