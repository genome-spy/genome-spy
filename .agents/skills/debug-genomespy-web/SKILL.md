---
name: debug-genomespy-web
description: Reproduce, diagnose, and smoke-test GenomeSpy browser behavior with Playwright or an interactive browser. Use for UI bugs, interaction problems, rendered-output checks, dev-server testing, or browser-console/network inspection; prefer unit tests for behavior that does not require a browser.
---

# Debug GenomeSpy in a browser

1. Prefer a focused Vitest test when it can reproduce the behavior reliably.
2. Use Playwright for real browser automation. An interactive browser or Chrome
   DevTools integration is also suitable when inspecting live state is useful.
3. For a focused Core WebGL smoke test, run
   `npm -w @genome-spy/core run capture:screenshots -- --check <example paths>`.
   It checks browser rendering errors but not pixel correctness; reserve
   `npm run smoke:examples` for broad coverage because Playwright is slow.
4. Open `http://127.0.0.1:8080/`.
5. If the development server is not running, start `npm start` from the
   repository root and keep the session available while testing.
6. The root page lists example and private specs; the first example is usually
   the quickest smoke test.
7. The App development entry exposes the runtime objects described below.
   Prefer inspecting them in the developer console or Playwright's browser
   context. Keep live runtime objects inside the browser context because they
   are not necessarily serializable across the Playwright boundary.
8. Reproduce the smallest relevant flow and inspect the debug API, visible
   output, console errors, and network behavior as appropriate. The Inspector
   provides a human-facing view of the same debug information.
9. After a fix, repeat the reproduction and add durable automated coverage when
   the behavior warrants it.

## Development runtime objects

- `window.__genomeSpy.api` is the `EmbedResult` returned by App's `embed()`.
- `window.__genomeSpy.viewRoot` is the current live internal `View`. Use its
  `visit(...)` method to traverse the hierarchy and treat runtime objects as
  read-only unless the debugging task specifically requires mutation.
- `window.__genomeSpy.viewRoot.context.dataFlow` is the live `DataFlow`.
- `window.__genomeSpy.api.debug.getModules()` loads Core's serializable snapshot
  helpers, which are also used by the GenomeSpy Inspector.

Development routes live in package `vite.config.js` files and share helpers in
the repository-root `devServerRoutes.mjs`.
