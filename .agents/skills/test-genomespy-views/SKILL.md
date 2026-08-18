---
name: test-genomespy-views
description: Test GenomeSpy generated specifications, rendered view hierarchies, layout semantics, and structured SVG output. Use when adding or reviewing layout snapshots, generated-spec snapshots, view-tree inspection, SVG export integration tests, or stable structured rendering output; do not use for ordinary isolated unit tests.
---

# Test GenomeSpy views and layouts

- Prefer focused snapshot tests when the complete structured shape is an
  intentional contract and the design has stabilized.
- Use `specToLayout(...)` or `renderToLayout(...)` from
  `packages/core/src/view/testUtils.js` instead of ad hoc inspection scripts.
- Follow the established patterns in `packages/core/layout.test.js` and
  `packages/core/src/view/layoutSnapshot.test.js`.
- Use headless SVG export as a structured rendering oracle when a test needs
  emitted geometry, presentation attributes, paint order, clipping, or view and
  mark grouping. Follow the DOM-query patterns in
  `packages/core/src/svg/examples.test.js` and the subsystem guidance in
  `packages/core/src/svg/README.md`.
- Prefer focused SVG DOM assertions over whole-document snapshots. Snapshot a
  complete SVG only when the fixture is compact and its exact serialized shape
  is an intentional contract.
- SVG tests cover the exporter and its shared view traversal, layout, scales,
  and CPU encoders. They do not replace browser tests for WebGL shaders,
  blending, antialiasing, or other renderer-specific behavior.
- Prefer representative assertions when only part of the shape matters; do not
  snapshot incidental implementation details.
- If existing output is unsuitable for stable snapshots, propose a
  snapshot-friendly representation or test helper. Do not refactor production
  code or test infrastructure solely for snapshot testing without developer
  approval.
- Add a short comment when setup or intent is non-obvious.
- Review snapshot changes for semantic intent rather than accepting them
  mechanically.

Run the narrowest Vitest suite that covers the output with `--reporter=agent`.
Use the full suite only when the scope or risk warrants it, and report if
relevant verification could not be run.
