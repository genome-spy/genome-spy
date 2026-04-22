# App Agent Split Cleanup Plan

This document tracks the remaining work after the browser agent and relay were
split into `@genome-spy/app-agent`.

The package split is in place. The remaining work is about making the boundary
cleaner, removing dev-only seams, and keeping the shared agent surface narrow.

## Current Context

- `@genome-spy/app-agent` owns the browser plugin and the Python relay.
- `@genome-spy/app` owns the app shell and the public host API.
- Development currently works by resolving workspace source for the app and
  agent packages.
- The relay now lives under `packages/app-agent/server`.

## Remaining Work

### 1. Narrow the public app surface used by the plugin

- Keep a single source of truth for agent-facing helpers in `@genome-spy/app`.
- Add explicit public subpath exports for the host helpers the plugin still
  needs.
- Move `app-agent` imports onto those public subpaths instead of the app root.
- Remove any shim files in `packages/app-agent/src/**` that only re-export app
  internals.
- Keep shared types and helper logic in one place; do not copy them into
  `@genome-spy/app-agent`.
- Verify that the agent package no longer imports from `packages/app/src/**`
  directly.

### 2. Remove dev-only resolution hacks

- Compare the dev-time and bundled package resolution paths for both
  `@genome-spy/app` and `@genome-spy/app-agent`.
- Keep source aliases only where they are needed to load workspace packages
  during development.
- Remove `optimizeDeps.exclude` entries that exist only to dodge the published
  build entry points.
- Prefer package exports over raw source paths when a published entry can serve
  both dev and bundle builds.
- Add a regression check that fails if dev starts resolving the wrong package
  entry again.

### 3. Finish cleaning package boundaries

- Remove any remaining agent-specific wrapper folders that only forward public
  app exports.
- Confirm that every `app-agent` import comes from public `@genome-spy/app` or
  `@genome-spy/core` exports.
- Keep `@genome-spy/app-agent` marked private in `package.json` until the
  publish story is decided.
- Ensure the browser package `files` list does not accidentally pull in the
  Python relay or other non-browser artifacts.
- Remove stale compatibility files after the plugin code switches to the new
  public surface.

### 4. Keep relay ownership and docs aligned

- Keep relay commands and docs pointing at `packages/app-agent/server`.
- Remove any stale references to `utils/agent_server` or the pre-split relay
  path.
- Keep the Python server packaging separate from the browser package payload.
- Keep the relay README, DGX setup notes, and any runbook snippets in sync with
  the actual startup command.
- Avoid introducing browser-package references into the Python server docs.

### 5. Add the minimal regression coverage for the split

- Verify the plugin still installs and disposes cleanly.
- Verify dev resolves workspace source for the app-agent package.
- Verify the bundled package still imports through published package exports.
- Verify the relay startup command documented in the repo still works.
- Add a targeted check for the package boundary regressions that already
  happened once, especially source-path resolution and stale dist imports.
- Keep the coverage close to the code that enforces the split, not in a broad
  end-to-end suite.

## Finish Line

The split is clean when:

- `embed()` stays agent-free unless a plugin is explicitly installed.
- `@genome-spy/app-agent` imports only public host APIs.
- Dev and bundled builds resolve the same package boundaries without ad hoc
  path fixes.
- The relay lives under `packages/app-agent/server` and the docs match that
  layout.
- The browser package stays npm-private and browser-only.
- No shared agent code is duplicated across packages.
