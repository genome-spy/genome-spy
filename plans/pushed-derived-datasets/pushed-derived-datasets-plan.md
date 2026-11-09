# Publishing derived datasets to an ancestor

This draft extends local dataset publication from
[issue #714](https://github.com/genome-spy/genome-spy/issues/714).

## Goal and grammar

A sibling view can draw from a summary produced elsewhere in a composition. For
example, a summary strip can appear above the view that supplies its rows. The
order of sibling declarations controls their presentation.

Declare `"datasets": { "scores": { "derived": true } }` in the common ancestor.
The descendant publishes with
`{ "type": "publish", "dataset": { "name": "scores", "push": "outer" } }`.
Sibling views can read it through `data.name` or `lookup.from.name` in either
order. See the
[grammar example](../../docs/grammar/transform/publish.md#sharing-a-table-with-siblings).

## Contract

- The nearest ancestor declaration must be a reserved slot. Resolution follows
  `dataParent` and honors lexical shadowing and import scope. The slot has one
  producer and is read-only.
- The owner and producer are constructed together. A reader can be added later.
  A hidden producer remains active while its owner is active. Removing the
  producer requires disposing the owner too.
- The publisher uses its own view's parameters and layout expressions. Eager,
  unpartitioned inputs publish complete tables, including empty results. Changes
  to input data or parameters update both reader types. Pending and failed
  inputs follow the local readiness rules.

## Implementation

Core reserves and claims the slot in
[`NamedDataScope`](../../packages/core/src/data/namedDataScope.js). The factory
claims publisher declarations before constructing descendants. Failed
construction releases claims on surviving ancestors, and finalization closes
claims when configuration finishes. Existing shared-output rules keep hidden
producers active and protect live owners during removal.

The slot holds a detached
[`DerivedCollector`](../../packages/core/src/data/derivedCollector.js) so early
readers can bind before its producer is wired. The builder rejects a dependency
cycle before attaching the producer and validates eager inputs after wiring.
Direct readers use the collector as an identity boundary so picking does not
depend on construction order. The existing collector publication and lookup
replay paths update readers after recomputation.

## Verification

1. Run the
   [pushed dataset tests](../../packages/core/src/data/namedDataScope.push.test.js)
   for both sibling orders, direct and lookup reads, asynchronous loads and
   recovery, parameter and named input changes, and empty results. Verify
   cycles, duplicate claims, shadowing, and unclaimed slots report errors.
2. Exercise hidden producers, insertion and removal of readers, and cleanup of
   failed construction and wiring. Verify producer-only removal and claims on a
   configured ancestor fail before changing the live graph.
3. Validate both examples against the stacked schema and exercise the sibling
   reader headlessly. Run Core type checking, schema generation, and release
   checks. Measure the incremental production change against the local branch.

The full Core suite passed after the split, including both local rollback
regressions and the pushed lifecycle tests. Both docs examples validated against
the schema and produced the expected rows in the headless engine.
