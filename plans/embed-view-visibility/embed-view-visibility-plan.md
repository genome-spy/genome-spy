# Retained view visibility

Add `api.views.visibility` with snapshot, set and reset operations alongside
existing ordered view mutations. Hide means no layout, rendering or picking;
views, data, parameters and selections remain alive. Showing initializes only
previously uninitialized visible data through the existing lifecycle.

Owners: Core owns visibility evaluation and refresh; a bare embed owns its
selector-keyed overrides. GenomeSpy App supplies its existing Redux overrides
through host accessors, preserving bookmarks and radio groups without another
store. Move shared pure visibility/configuration helpers from App into Core;
keep App persistence conversion and all Lit controls where they are. Reuse
existing scoped selectors, mutation queue/transactions, lazy initialization and
size/render invalidation. No brush changes, controls package or app workaround.

The API snapshot is detached hierarchy metadata: selector/title, configured,
effective and default visibility, configurable flag, group and children.
Set validates the address and boolean, handles scoped radio siblings, and awaits
visibility refresh. Reset restores authored defaults. Reject finalized embeds
and ambiguous/disposed addresses. Refresh structural changes through the same
owner so inserted/restored views follow existing overrides. Keep old App keys
readable; do not change saved formats or replay computation.

Verification: focused public-API/native-host tests for scoped repeated tracks,
parent hiding, retained data/selection, radio groups, queued actions/transactions,
mutation, lazy loading and finalization; existing App visibility/bookmark tests;
Core/App typing, lint, schema/docs and release checks. Record a short headless
browser demo. Add a minor Core changeset and open a separate PR, without merging
or publishing a release. Reconcile this plan before delivery.

Review resolved: menu configurability does not restrict API writes; targets must
be uniquely named for stable selector identity. Snapshots include non-menu named
views. Transactions schedule layout through their existing deferral hook. App
subscribes to visibility and hierarchy revisions through the same Core refresh.
Bare embed overrides survive remove/reinsert of the same selector until reset;
App keeps its existing removal pruning. Failed shows retain requested choices
and report loading failures; finalization rejects further API access.

Implementation review resolved: named roots remain in the snapshot, separate
from host menu presentation. Writes reject while the existing hover-suspension
boundary marks a native document drag; no brush/ruler controller changes.
Visibility refresh clears stale hover/picking and uses the transaction-aware
layout request. A finalization-during-load regression verifies no post-disposal
layout is scheduled.
