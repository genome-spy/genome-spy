# Practical embed integration polish

Status: active follow-up. Improve the current implementation; do not restart it.

## Goal

Make the annotation, sequence-editor, and selection-form examples behave reliably
in ordinary use, and verify the notebook integration. Keep the existing public API
shape and ownership. The user has authorized correcting parameter and selection
observation timing to settled graph-effect delivery, including legacy
`getParam().subscribe()`, without a separate compatibility path. Prefer a small
fix or an honestly documented limitation over new machinery for rare cases. This
plan does not require exhaustive correctness.

The implementation is substantially simpler than the rejected attempt. Preserve
that progress: no renderer changes, extra trackers, scheduling frameworks, or API
expansion. If a fix needs substantial production code or a public-contract change,
stop and show the user the concrete tradeoff before implementing it.

## Milestones and review gates

Execute the detailed work below in three reviewable groups:

1. Gate A: hover lifecycle, stale-hit invalidation, and safe annotation rendering
   (implemented; focused checks pass).
2. Gate B: coherent parameter and selection observations, including the
   authorized legacy timing correction (implemented; focused checks pass).
3. Gate C: practical picking, notebook, and Observable verification (partially
   implemented; browser and environment limits recorded below).

Commit each gate after its focused checks pass. Do not treat the observation
timing correction as awaiting additional approval; stop only if implementation
requires a broader API or architectural expansion.

## 1. Fix the everyday interaction issues

- [x] Render annotation table cells in both examples with `textContent` instead
      of interpolating names/descriptions into `innerHTML`. Check literal angle
      brackets and quotes.
- [x] Notify hover consumers when the pointer leaves or brushing suspends hover.
      Suppress repeated notifications for the same mark/ID/datum. Use the existing
      controller state and notification path, not a per-subscriber tracker. Do not
      introduce deep datum equality or detect arbitrary in-place object mutation.
- [x] Prevent activation from using an obsolete hit after a scene update. Prefer
      invalidating the confirmed hit through the existing render/update path and
      letting the existing hover refresh restore it. Missing a click while refreshing
      is acceptable; adding a pick queue or another cache is not.
- [x] **Make parameter and selection observations coherent, including legacy subscriptions.** Replace
      direct ref subscriptions in both legacy and modern embed adapters with owner-bound graph
      effects, using the existing runtime propagation and disposal mechanisms.
      Callbacks must observe settled dependent values rather than intermediate writes
      within a transaction. Keep subscriptions future-only. The user explicitly
      authorizes changing `getParam().subscribe()` to the same coherent timing; do not
      maintain a separate synchronous compatibility path. This is required.
- [x] Apply the same coherent publication rule to selection observations. Keep
      interval commit delivery tied to gesture completion, but deliver its snapshot
      after pending runtime changes settle. Avoid duplicate completion/programmatic
      notifications. Reuse the current runtime and controller; do not add a scheduler
      or transaction framework. If their integration needs a substantial change,
      present the tradeoff to the user rather than silently retaining incoherence.
- [x] Add representative tests: a batched update to two parameters where a modern
      callback reads both and a dependent expression; a selection update observed
      after dependent state settles; and brush completion delivering one settled
      commit. Assert that subscriptions do not fire initially and stop after disposal.
      Use the runtime propagation barrier instead of timers. Include legacy `getParam().subscribe()` in the
      coherent-delivery checks; no exhaustive reentrancy matrix is required.

  Done: embed API tests cover modern and legacy batched observations, dependent
  selection state, initial silence, and disposal. GridChild coverage exercises a
  real brush completion, one settled commit, duplicate registrations, and
  modification during delivery.

Streamline these paths while fixing them, without creating a separate refactoring
project:

- [x] Share coherent observation wiring between parameter handles and ordinary
      selection observations through one small graph-effect helper. Reuse existing
      ownership/disposal and allow selection snapshot conversion at the boundary.
- [x] Share parameter-handle construction after lookup. Keep legacy global lookup
      and modern lexical lookup separate, and preserve their write restrictions and
      necessary render behavior. Avoid a configurable handle framework; retain small
      explicit differences where sharing would cost more code than it removes.
- [x] Merge the identical parameter/selection listener-error wrappers. Route point
      selection commit subscriptions through the same path as change subscriptions;
      only interval gesture commits need a distinct path.
- [x] Centralize replacement/clearing of confirmed hover and change notification
      in the existing controller, removing scattered state assignments. Keep one hover
      owner; do not add per-subscriber state or another cache.

Keep the small lifecycle helper and useful explicit types. Measure the affected
code before and after; prefer deleting duplicate paths over adding abstractions.
Verify these simplifications with the behavioral checks already listed, not new
tests that mirror helper structure.

Affected areas: `interactionController.js`, `embedParamApi.js`, and the annotation
example. Read Core instructions and the relevant architecture before editing;
use the browser-debug skill for interaction verification.

Verify with focused tests for leave/suspension, repeated hover, and a dataset
update followed by a click before refresh. Browser-check brush → context menu →
save/cancel, annotation hover/leave, and repeated DNA edits. Use the examples to
catch regressions rather than constructing an exhaustive event-state matrix.
Update public docs only where necessary using the documentation skill.

Tentative commit: `fix(core): polish embed hover and observation behavior`.
The annotation text fix can accompany it or be a small separate fix.

## 2. Check picking and notebook behavior in practice

- [x] Exercise overlapping marks sharing a dataset, particularly the DNA editor's
      text and rectangle layers. The common parent scope works for the editor; no
      ownership change is needed for the two layers sharing each datum.
- [ ] Run the marimo example, not just a Python syntax check. Verify a browser
      selection reaches Python and published annotation rows return to GenomeSpy.
      Fix concrete startup, cell-reactivity, and cleanup problems with the smallest
      working bridge. No reusable notebook framework or transport redesign. Blocked
      here because `marimo` is not installed in the environment; Python syntax passes.
- [x] Check the Observable recipe's subscription and cleanup usage. Document
      actual startup steps and any manual refresh requirement. If the notebook cannot
      be run in the available environment, leave verification incomplete explicitly.

Verification record: the DNA editor passed repeated-click editing in a real
browser, and the selection form passed Shift-brush, save, and literal HTML-value
table checks. The annotation editor's brush did not activate in the same browser
run, so that workflow remains unverified. The local bridge now accepts local
development origins and CORS preflight methods, but its end-to-end workflow still
requires marimo.

Affected areas: the existing picking resolver, `packages/embed-examples`, and
notebook instructions. A documented backend limitation is acceptable; claiming
unverified support is not.

Tentative commit: `fix(embed-examples): verify notebook and picking workflows`.

## Finish

- [x] Run the affected unit suites, relevant type checks, lint, and the embed
      examples smoke build. Broaden testing only if failures or wider changes justify
      it. Record the actual browser and notebook checks performed. Done: focused
      Core suites, Core type check, lint, and the embed examples smoke build pass;
      Python syntax also passes.
- [x] Update the old plan's stale size and completion record. At review commit
      `cab18da31`, Core production changes against `master` were 1,401 added,
      120 removed, net +1,281 lines, including types/comments/blanks and excluding
      tests. Recalculate against original baseline
      `491e632a0533d6bb551246b09cb8bdfb7c860ef2` after the fixes and report this
      follow-up's additional delta separately. Aim for flat or reduced production
      size; explain any meaningful growth rather than pursuing a cosmetic line cap.
      Recalculated current Core non-test delta: +1,489/-156, net +1,333. The
      follow-up delta from `cab18da31` is +190/-110, net +80 across Core,
      examples, and notebook files. The growth is mostly focused tests and the
      authorized settled-observation wiring; the shared handle cleanup removed
      38 production lines from `embedParamApi.js`.
- [x] Commit each verified group using the delivery skill. Keep review fixes
      within the group; no repeated review ceremony for minor edits. Reconcile and
      retire temporary plans before PR delivery according to repository instructions.

Done means the ordinary example workflows work, the identified stale-hover and
unsafe-text issues are fixed, legacy and modern observations are coherent, and
remaining limitations are explicit. It does not mean every hypothetical race,
alias configuration, or notebook host is supported.

## Follow-up: remove remaining local duplication

Implement these as small, separately measured changes. Preserve the public API
and existing behavior; do not introduce a general subscription or lifecycle
framework. Read the current code first because earlier milestones may already
have removed some duplication.

- [x] Remove namespace-level liveness checks immediately duplicated by the scoped
  parameter/selection resolvers. Retain resolver checks and checks on subsequent
  handle operations.
- [x] Collapse point-selection commit and ordinary change subscriptions into the
  same settled-value path. Only `delivery === "commit" && controller` needs the
  distinct interval-completion branch.
- [x] Use `declaration.config` directly when determining whether a scoped parameter
  is computed. Remove the repeated config-map lookup and redundant existence check.
- [x] Replace mark, hover, and interval-commit listener arrays with Sets of
  registration objects, removing index/search/splice unsubscribe code. Preserve
  independent registrations of the same callback and snapshot iteration during
  delivery; use idempotent `delete()` for unsubscribe.
- [x] Simplify legacy lookup into one traversal accumulating the effective-runtime
  map. Remove the intermediate matches array and single-use collection/flag
  helpers if this makes the complete implementation smaller and clearer. Preserve
  missing/ambiguous lookup errors and computed/point-selection write restrictions.
- [x] Combine hover replacement and change notification into one controller method
  if notification still has only that caller. Retain the small clear operation
  that resets the confirmed point, and preserve hit comparison and delivery order.

### Required measurement after each change

Before each checklist item, record line counts for the production files it will
change. After that item, compare those same files and record added, removed, and
net production lines for that item alone, including JSDoc, declarations, and blank
lines. Also report the cumulative production delta for this follow-up. Do not
report only the final combined reduction or count test deletions as production
savings. A compact table in this plan is sufficient:

| Change | Production lines before | After | Added | Removed | Net |
| --- | ---: | ---: | ---: | ---: | ---: |

Use `wc -l` plus a diff against a saved pre-change snapshot or commit. If unrelated
edits exist, keep them out of the per-change measurement. Reconsider or discard a
refactor that grows code without a clear readability or correctness benefit;
never compress formatting to improve the count.

Measurement record for this follow-up (baseline commit `9a4fdff69`):

| Change | Production lines before | After | Added | Removed | Net |
| --- | ---: | ---: | ---: | ---: | ---: |
| Remove duplicated namespace liveness checks | 437 | 435 | 0 | 2 | -2 |
| Share point commit/change observation path | 435 | 422 | 0 | 13 | -13 |
| Read `declaration.config` directly | 422 | 421 | 1 | 2 | -1 |
| Store mark and hover listeners as registration Sets | 1253 | 1243 | 8 | 18 | -10 |
| Store interval commit listeners as registration Sets | 733 | 729 | 8 | 12 | -4 |
| Simplify legacy lookup traversal | 421 | 381 | 18 | 58 | -40 |
| Combine hover replacement and notification | 1243 | 1236 | 6 | 13 | -7 |

Cumulative production delta for the follow-up: +42/-109, net -67 lines across
the three production files. The additional test harness is not counted as a
production saving or cost.

Verify each affected behavior with the narrow existing tests. For listener storage,
check duplicate registration, unsubscribe, and modification during delivery. For
legacy lookup, run the existing ambiguity/alias/write-restriction tests. Keep
necessary stale-handle checks, required-ref validation, and disposal protections.
Commit coherent verified groups; a separate commit for every measurement is not
required.
