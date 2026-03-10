# Multiple Assemblies Plan (Remaining Work)

## Scope

Core multi-assembly support is in place (root `genomes` + `assembly`,
scale-level assembly definitions, inline contigs/url, assembly preflight,
and synteny use case). This document tracks only open follow-up work.

## Remaining Items

### 1. Deprecation completion (legacy root `genome`)

1. Decide deprecation window/version for removing root `genome`.
2. Prepare removal PR:
   - remove legacy parsing path in `rootGenomeConfig`
   - remove deprecated type aliases tied to legacy root `genome`
   - remove legacy warning logic and tests
3. Add migration notes in release/changelog docs.

### 2. Test hardening for dynamic scenarios

1. Add integration-level test where a dynamically inserted child introduces a
   new locus assembly and assembly preflight loads it before scale init.
2. Add integration-level test for hidden/lazy views whose locus assembly is not
   used until they become active.
3. Keep regression coverage for mixed named/inline URL assemblies under repeated
   subtree additions.

### 3. Documentation polish

1. Add explicit docs examples for object-valued `scale.assembly`:
   - inline `contigs`
   - inline `url`
2. Keep primary docs focused on `genomes` + `assembly`; legacy root `genome`
   belongs in migration notes only.
3. Regenerate schema/docs artifacts after doc/spec edits.

## Validation Checklist (for remaining work)

1. `npm run lint`
2. `npm -ws run test:tsc --if-present`
3. Focused tests:
   - `packages/core/src/genome/*.test.js`
   - dynamic view/container mutation tests
4. Manual sanity:
   - `packages/core/private/synteny/synteny.json` renders without genome errors

