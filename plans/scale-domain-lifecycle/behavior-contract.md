# Domain lifecycle behavior contract

Milestone 1 records the compatibility boundary. Milestone 2 will exercise a
proposed policy separately; it does not change the live runtime. Paths below
are relative to the repository root.

## Values with different meanings

| Value             | Meaning                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Displayed domain  | Effective bounds/categories read by `domain()`, rendering, and listeners, including intermediate animation frames.                                     |
| Candidate         | Configured/selection/data/viewport result after scale-specific normalization, before lifecycle policy.                                                 |
| Reset target      | Domain requested by reset. A configured starting interval can differ from both the display and the full data extent.                                   |
| Initial reference | Domain used by default zoom bounds and as a zoom-level reference; currently captured once, including on early interaction.                             |
| Data extent       | Current union of data contributions, used independently by `zoom.extent: "data"`. For lazy data this is loaded data, not an assumed whole-file extent. |
| Initial readiness | Completion of relevant initial inputs, including empty results and side dependencies. Independent of candidate length or a physical scale existing.    |

Selection authority does not disappear when its interval is cleared. Clearing
selects the normal fallback and bypasses `initial`; later ordinary data updates
must still follow the linked selection's semantics.

## Behaviors to retain

- Configured index/locus intervals and zoom extents are inclusive at the public
  boundary. Internal intervals are half-open; selection intervals are already
  internal and must not receive a second end increment. Preserve chromosome-only
  domains, genome extents, ranged mark endpoints, and fractional navigation.
- Shared index scales can show a configured interval while the data zoom extent
  grows. Navigation changes the display; reset restores the configured interval.
- Ordinary updates preserve a finalized zoomable domain even if the user has
  never navigated. An `interacted` flag alone does not encode existing policy.
- Early navigation is not undone by later shared contributors, including empty
  contributors. Preserved domain updates do not emit transient candidate domains.
- Before relevant initial inputs finish, partial domains may be displayed but
  must not animate. The completing initial update is also immediate.
- Non-zoomable continuous domains can animate after rendering. Structural index
  domains and discrete domains update immediately. Normalize `nice`/zero/etc.
  before comparing domains; a candidate change need not change displayed bounds.
- Viewport autoscaling waits for navigation to pause and for active contributors
  to cover their requested intervals. Ready-empty viewports retain the last
  nonempty domain. Query/debounce policy remains viewport-specific.
- A zoomable linked scale writes navigation back to its selection. Data refresh
  retains a nonempty linked interval; clearing uses the latest fallback, not
  the configured `initial`. Non-zoomable links only read the selection.
- `domain()` observes every effective transition frame. Calibrated expressions
  settle before rendering and do not start a second transition by default.
- Completed initialization is not reopened by member insertion/removal or
  visibility changes. Membership can still change candidates and data extents.
- Parameter owner scope, `push: "outer"`, selection persistence, named scale
  APIs, categorical index stability, and domain-triggered layout remain intact.

## Evidence and characterization coverage

`packages/core/src/scales/scaleResolution.lifecycle.test.js` adds temporal
scenarios rather than snapshots of generated implementation details:

| Example pattern                                               | Assertions                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/docs/examples/genomic-data/dynseq-spi1-bqtl.json`   | Pending lookup and ready-empty lookup have identical empty collector contents; only actual side coverage distinguishes them. Side publication replays primary rows. |
| `examples/docs/examples/genomic-data/msa.json`                | Configured `[190,230]` becomes internal `[190,231]`; delayed shared data expands the data zoom extent without replacing navigation or the reset target.             |
| Shared lazy tracks                                            | Partial initial data, navigation, late larger contribution, then empty contribution preserve the displayed domain without notifications.                            |
| Zoomable signal data refresh                                  | Preservation also applies after initialization without prior interaction.                                                                                           |
| `examples/core/selection/interval_linked_domain_two_way.json` | Actual overview/detail spec with deterministic dynamic data: initial, navigation, refresh, and clear retain selection authority.                                    |
| `examples/docs/grammar/scale/viewport-autoscale.json`         | Actual encoding/mark setup with a small deterministic signal: debounce, narrower domain, and ready-empty gap.                                                       |

Existing regression suites retain the remaining important boundaries:

- `scaleResolution.domain.test.js`: delayed coordinate lookups, notification
  equality after nicing, viewport lazy coverage, index/locus endpoints, categorical
  ordering, and initial shared contributor union.
- `scaleResolution.parameterDependency.test.js`: calibrated transition frames,
  same-scale domain-to-range dependency, insertion/disposal, initialization cleanup.
- `scaleResolution.selectionLink.test.js`: one-way/two-way synchronization,
  clearing, persistence, selection scope and dependency-cycle errors.
- `scaleResolution.viewLevelProps.test.js` and `.topology.test.js`: member
  registration and property ownership. Integration must add explicit lifecycle
  sequences for insertion/removal after initialization.

The documentation sources are `docs/grammar/scale.md` (index/locus conventions,
viewport autoscaling, transitions, expressions and selection domains),
`docs/grammar/parameters.md` (clearing and persistence), and the example specs.
The remote genomic examples are represented by deterministic local dependency
shapes; these tests make no claim about remote data availability or GPU output.

## Intentional corrections and integration decisions

1. **Ready-empty initialization:** replace nonempty-domain inference with explicit
   relevant-input readiness. Do not replace it with `collector.completed`: lazy
   startup and pending lookup batches both emit empty completions today.
2. **Early interaction and reference collection:** the current workaround freezes
   the reference at interaction. The proposed model separates preservation of the
   display from collection of the complete initial reference. Changing default
   zoom bounds after that early interaction is an intentional correction to
   verify during integration, not existing behavior claimed by milestone 1.
3. **Reset:** current reset calls configured/default resolution independently of
   the captured reference. Some unconfigured quantitative/index cases resolve to
   an empty array. Do not silently substitute the initial reference during this
   refactor. The policy receives an explicit reset target; integration must
   characterize and resolve unsupported empty reset behavior separately.
4. **`domainTransition: false`:** current code applies the candidate before it
   would preserve a zoomable display. Separate authority from animation in the
   proposed policy: explicit expression/configuration updates remain able to
   apply, while late ordinary data cannot override navigation merely because
   animation is disabled. Integration must test this intentional correction.
5. **Notification equality:** immediate domain updates currently sometimes notify
   despite equal values. The proposed commit path notifies only a changed display;
   readiness-only progress must have its own signal, including completion with no
   data change. Verify lazy startup and range/layout consumers before adoption.

## Milestone 1 verification

The new cases use the existing headless engine and real dataflow publication,
without new production infrastructure. Existing animation tests remain the
frame-by-frame oracle. No public documentation/example changes are needed for
this characterization-only milestone.
