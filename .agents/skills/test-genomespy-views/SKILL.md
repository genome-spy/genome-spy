---
name: test-genomespy-views
description: Test GenomeSpy generated specifications, rendered view hierarchies, and layout semantics. Use when adding or reviewing layout snapshots, generated-spec snapshots, view-tree inspection, or stable structured rendering output; do not use for ordinary isolated unit tests.
---

# Test GenomeSpy views and layouts

- Prefer focused snapshot tests when the complete structured shape is an
  intentional contract and the design has stabilized.
- Use `specToLayout(...)` or `renderToLayout(...)` from
  `packages/core/src/view/testUtils.js` instead of ad hoc inspection scripts.
- Follow the established patterns in `packages/core/layout.test.js` and
  `packages/core/src/view/layoutSnapshot.test.js`.
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
