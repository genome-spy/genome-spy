# Coverage transforms

Core owns the interval sweeps and generated record identities. Keep the
existing `coverage` grammar for scalar depth and add `categoricalCoverage`
for one row per category in each coalesced span. The two transforms share
coordinate properties and aliases. SampleView continues to supply sorted
intervals in sample-group facets through `mergeFacets`.

## Scalar coverage

Use one loop to drain endpoints. Preserve the output aliases, weight
arithmetic order, and file and facet boundaries. A drained queue represents
zero coverage even after floating-point roundoff. Generated spans get their
own identities when downstream marks need them.

Verify weighted gaps, alias and batch behavior, and picking through a normal
Core spec. Commit as `fix(core): correct coverage gaps and picking identities`.

## Categorical coverage

Sweep half-open intervals in chromosome blocks or on a linear axis. Coalesce
adjacent spans when their count vectors agree. Use a configurable `category`
input field and three optional `as` aliases for the category, count, and total.
The private chromatin-state PoC verified the composition. The public frequency
example exercises the transform independently with an ordinary stack.

Verify against per-base counts and run the SampleView grouping and picking
regression, schema generation, and the shared example suite. Document the
ordering and missing-call contract. Commit as
`feat(core): add categorical interval coverage`.

## Review and scope

The independent PoC review and two simplification passes checked the sweep
against a per-base reference. Headless comparisons of the hardened code checked
weighted intervals, tied endpoints, and a real 66-profile mouse window. Signed
stacking and the private S1 recipe are tracked in the PoC worktree.
