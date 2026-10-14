# Agent data hooks

Extend PR #537 on `codex/agent-data-hooks`; leave the main checkout unchanged.
GenomeSpy hooks only inspect/control visualization data, never run app models.

- [x] Opt-in retained source rows and public detached reads before view transforms.
  Verify crowded gene-style filters, updates, inherited/overridden data, disposal
  and no retention unless requested. Commit a working checkpoint.
- [x] Report published source domains/readiness and configured/effective visibility
  without claiming pixel visibility or full biological coverage. Test lazy pending,
  replacement/invalidation, hidden views and query lifecycle.
- [x] Document public types and usage; regenerate API/schema outputs, run Core
  types/tests/build and record remaining app integration and future hooks.

Use existing collectors and source loading. No automatic refetch, model calls,
private app access, new dependencies or changes to PR #537's annotation limits.

Implemented: `readSourceData`, opt-in `retainForInspection`, `describeSource`,
primary source state in query results and visibility/opacity in view descriptions.
Eager source loading can be complete while transformed query results omit rows.
Lazy bounds describe publications; full-resolution completeness remains unknown.

Verification: 4,509 unit tests passed (2 skipped, 2 todo), all workspace type
checks, Core build/schema/declarations, focused lint/format, reproducible API docs
and optional/minimal bundle checks passed. Seven added behavioral tests cover
source filters, updates, limits, ownership, disposal, lazy state and visibility.

App integration is excluded from this PR and deferred until Core merges and the
Python package is updated. Then adopt one compatible runtime, name track units,
opt in to retained source rows and expose the native APIs through `genomespy.*`.
Model jobs remain `app.*`. Range annotations, off-viewport source requests,
navigation gesture events and cell selection restore remain separate work.
No browser/PWA or live app integration is claimed for this Core-only increment.
