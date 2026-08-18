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
7. Reproduce the smallest relevant flow and inspect visible output, console
   errors, and network behavior as appropriate.
8. After a fix, repeat the reproduction and add durable automated coverage when
   the behavior warrants it.

Development routes live in package `vite.config.js` files and share helpers in
the repository-root `devServerRoutes.mjs`.
