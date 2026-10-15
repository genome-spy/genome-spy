# Dendrogram viewport autoscaling

## Goal and scope

When the clustered heatmap is zoomed or panned, fit each dendrogram's height
scale to links whose two integer index anchors are inside the visible index
domain. Keep zero as the height baseline and retain the last nonempty domain
when no complete link is visible.

Keep this small: reuse viewport autoscaling, its navigation debounce, domain
transitions, and collector queries. Do not change dendrogram layout, clustering,
offset handling, or renderer geometry. No new dataflow or tree-specific runtime.

## Current implementation and design

- `packages/core/src/spec/scale.d.ts` declares `ViewportDomainRef` with
  `source: "viewport"`.
- `packages/core/src/scales/viewportDomain.js` builds positional constraints
  from primary and secondary encoders. `ScaleResolution` owns configuration.
- `packages/core/src/data/viewportDomain.js` scans collectors or queries cached
  x-sorted block summaries. Both currently select overlapping intervals.
- The example excludes each height scale from matrix scale sharing, disables
  height zooming, and clips links only on their index axis.

Add optional `mode: "intersect" | "contain"` to `ViewportDomainRef`.
`intersect` preserves the existing default. `contain` requires both endpoint
values to be inside each independent positional domain, including its bounds.
Normalize endpoint and domain direction, so reversed links and axes behave the
same. Point marks retain their current inclusive behavior in either mode.
Resolve the mode in existing shared viewport validation (the ordinary scale
property merge excludes domains). Return `undefined`, `"intersect"`, or
`"contain"`; normalize omitted modes on configured viewport references to
`"intersect"` and reject conflicting configured modes. Members without an
authored domain inherit the resolution's mode, including view-level declarations.

Carry the mode in the existing viewport constraints. Reuse block indexes and
target summaries and index keys. Existing overlap block rejection is conservative
for containment; leave it unchanged and adapt only whole-block acceptance and
the exact predicate. Degenerate endpoint pairs already force exact scanning.
Do not create a second indexing or scheduling path.

Enable containment domains on both dendrogram height scales in
`examples/docs/examples/generic/clustered-heatmap.json`, preserving their
existing zero/nice/zoom/reverse options. Set the two link marks to `clip: true`
so ancestors beyond the fitted height domain stay inside their panels.

Vega-Lite's [scale domains and clipping documentation](https://vega.github.io/vega-lite/docs/scale.html#scale-domains)
provides the comparable pattern: derive domains independently and clip retained
marks to the view. GenomeSpy's existing viewport query is the smaller fit than
adding a filtered duplicate tree or an expression/aggregate pipeline. No
external code is copied or adapted.

## Alternatives, risks, and open questions

- Changing the default to containment would alter signal/interval autoscaling;
  retain intersection as the default.
- Filtering tree data would remove boundary-crossing branches and replay data
  during navigation; keep all links and change only the height domain.
- Fractional endpoint offsets and screen-space containment are explicitly out of
  scope at the user's request. Integer anchor containment is the contract.
- A broad fully contained link may still have a high merge height. Eligibility
  is per link, not per complete subtree.
- Indexed and scanned queries must agree, especially at inclusive boundaries
  and when several target scales reuse one collector index.
- No unresolved design questions. Prefer minimal additions to existing tests.

## Milestone and acceptance criteria

### Containment autoscaling and clustered heatmap integration

Outcome: one backward-compatible viewport-domain option supports the heatmap
and other interval/link marks, using the existing lifecycle and rendering paths.
Consumers: specification/schema, scale constraints, collector queries, docs,
and the shared clustered heatmap example.

- [x] Add the option and thread it through resolved scale constraints; test
      conflicting shared modes and inheritance by implicit contributors.
- [x] Implement containment in exact scans and existing block queries.
- [x] Verify representative contained/crossing/reversed/point boundary cases;
      extend the indexed-versus-scan coverage to both modes.
- [x] Add a focused spec-to-scale regression using the real dendrogram
      transform, shared index scales, both orientations, navigation, and an
      empty eligible viewport. Cover a view-level domain declaration.
- [x] Update schema validation, scale docs, example prose, and the example.
      Build current schemas before editing example specs.
- [x] Add a minor Core changeset for the optional functionality.
- [x] Run focused Vitest suites with the agent reporter, workspace type checks,
      lint, release checks, and targeted schema/docs generation as needed.
- [x] Use the browser to inspect the real clustered heatmap at full extent,
      zoomed/panned extents, and reset; verify fitted domains and clipping.

Tentative implementation commit:
`feat(core): fit viewport domains to contained links`

## Requested review and commit sequence

- [x] Independent subagent review of this plan; resolve actionable findings.
      Clarified shared-mode validation and retained conservative block rejection.
- [x] Commit the reviewed plan before implementation (`25b7476b1`).
- [x] Implement and verify the milestone, then commit it (`3244ebf04`).
- [x] Independent implementation review covering downstream query consumers,
      shared scales, boundaries, clipping, and default compatibility.
      No runtime findings or worthwhile production simplifications; found stale
      validator return-value assertions in the existing domain planner tests.
- [x] Apply worthwhile correctness and KISS fixes, verify, and commit the fixes
      with this plan's final task status. Do not manufacture a code fix if none
      is justified; the final record can be the last commit.
      Updated the existing assertions and exercised view-level containment in
      their existing fixture; added no duplicate test cases.

The plan remains a temporary branch artifact. Reconcile all tasks before any
later retirement, and delete it in a later commit before PR creation or merge.

## Verification record

- 148 tests passed across collector, scale domains, real dendrogram navigation,
  owner/lifecycle behavior, and generated schema suites.
- The full suite initially found three stale validator assertions. After the
  review fixes, all 530 suites passed: 4,993 tests passed, one skipped, two todo.
  Core TypeScript checks passed again after the test changes.
- Workspace TypeScript checks passed after correcting the new fixture's required
  concat column count; lint and formatting checks passed.
- Regenerated schemas, docs assets, and the grammar type index. Zensical's clean
  docs build passed. Used the existing virtualenv directly after uv's default
  cache was sandbox-restricted.
- Browser smoke checks passed for the clustered heatmap and existing viewport
  signal example. Real WebGL zoom/pan/reset checks matched independently computed
  contained-link maxima; zero baselines and both-axis clipping remained active.
  Example zoom: column maximum 44.27 to 12.94, row maximum 50.53 to 17.79.
- Main query helpers grew from 739 to 770 lines. The runtime and specification
  changes add 43 net lines, with no new scheduling or indexing path.
- Release policy checks passed; the optional Core feature requests a minor bump
  to 1.2.0 in the configured fixed release group.
