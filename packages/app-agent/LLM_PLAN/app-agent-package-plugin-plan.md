# App Agent Split Cleanup Plan

This document tracks the remaining work after the browser agent and relay were
split into `@genome-spy/app-agent`.

The package split is in place. The remaining work is about making the boundary
cleaner, removing dev-only seams, and keeping the shared agent surface narrow.

## Current Context

- `@genome-spy/app-agent` owns the browser plugin and the Python relay.
- `@genome-spy/app` owns the app shell and the public host API.
- Development now resolves workspace source through package `development`
  exports, without Vite-specific source aliases.
- The relay now lives under `packages/app-agent/server`.

## Remaining Work

### 1. Narrow the app surfaces used by the plugin

- Keep a single source of truth for agent-facing helpers in `@genome-spy/app`.
- Add explicit app-internal subpath exports for the helpers the plugin still
  needs.
- Move `app-agent` imports onto those public subpaths instead of the app root.
- Remove any shim files in `packages/app-agent/src/**` that only re-export app
  internals.
- Keep shared types and helper logic in one place; do not copy them into
  `@genome-spy/app-agent`.
- Verify that the agent package no longer imports from `packages/app/src/**`
  directly.

### 2. Finish cleaning package boundaries

- Remove any remaining agent-specific wrapper folders that only forward public
  app exports.
- Confirm that every `app-agent` import comes from project-internal app
  surfaces or public `@genome-spy/core` exports.
- Keep `@genome-spy/app-agent` marked private in `package.json` until the
  publish story is decided.
- Ensure the browser package `files` list does not accidentally pull in the
  Python relay or other non-browser artifacts.
- Remove stale compatibility files after the plugin code switches to the new
  public surface.

### 3. Keep relay ownership and docs aligned

- Keep relay commands and docs pointing at `packages/app-agent/server`.
- Remove any stale references to the pre-split relay path.
- Keep the Python server packaging separate from the browser package payload.
- Keep the relay README, DGX setup notes, and any runbook snippets in sync with
  the actual startup command.
- Avoid introducing browser-package references into the Python server docs.

### 4. Add the minimal regression coverage for the split

- Add one bundled-build smoke test that imports the packaged app and the
  packaged agent from their `dist/` entry points.
- Build both workspaces first, then assert that:
  - `@genome-spy/app` resolves its public subpaths from `dist/`
  - `@genome-spy/app-agent` resolves `@genome-spy/app` through package exports
  - the agent plugin factory can be imported from the built bundle and called
    with a `baseUrl`
- Keep the smoke test focused on the JS package boundary only; do not involve
  the Python relay or any provider transport.
- Keep a smaller dev-time import check only if it still guards a different
  failure mode than the built-package smoke test.
- Cover the specific regressions that already happened once: stale dist entry
  resolution, broken app-agent imports, and workspace-source vs bundled-entry
  drift.
- Keep the coverage close to the code that enforces the split, not in a broad
  end-to-end suite.

Status: implemented in
[`packages/app-agent/src/agent/packageSplit.test.js`](/Users/klavikka/hautaniemi/genome-spy/packages/app-agent/src/agent/packageSplit.test.js),
which builds the packaged app and agent, loads both `dist/` entry points, and
initializes the packaged app with the packaged plugin through `embed(...)`.
The package Vite configs keep `development` resolution serve-only so the smoke
test hits the bundled entry points in production builds.

## Finish Line

The split is clean when:

- `embed()` stays agent-free unless a plugin is explicitly installed.
- `@genome-spy/app-agent` imports only the project-internal app surfaces
  exposed for it.
- Dev and bundled builds resolve the same package boundaries through package
  exports, without ad hoc path fixes.
- The relay lives under `packages/app-agent/server` and the docs match that
  layout.
- The browser package stays npm-private and browser-only.
- No shared agent code is duplicated across packages.
