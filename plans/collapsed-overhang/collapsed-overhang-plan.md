# Collapsed overhang

## Goal

Allow a view to suppress external overhang reservation on selected physical
edges while continuing to render the corresponding axes, titles, legends, or
custom overhang. This enables intentional overlap in dense layouts, such as
placing the UpSetR set-size axis above its bars without adding a row-sized gap.

## Proposed API

Add an optional view-level property:

    "overhang": { "top": false }

The type is a partial map of top, right, bottom, and left to booleans.
Missing sides retain the current behavior. false disables only layout
reservation; it does not clip, move, or hide the overhanging element. Explicit
view padding remains additive and can provide a deliberate safety margin.

The property applies to overhang owned by the view's local grid child. Shared
guides remain controlled by the view that owns the shared grid guide.

## Implementation steps

| Step | Outcome and affected areas | Verification and docs | Commit |
| --- | --- | --- | --- |
| 1. Core contract | Add the schema/JSDoc type in packages/core/src/spec/view.d.ts and a small helper for applying the edge mask. Apply the effective value at GridChild, where local guide, title, and view overhang are combined. Keep layout sizing, placement, rendering, custom overhang, and shared-guide handling consistent. | Add focused core tests for default behavior, per-edge suppression, and padding remaining reserved. | feat(core): add view-level overhang reservation |
| 2. Layout regression | Verify that a top axis with collapsed top overhang renders in the same coordinate space but does not enlarge the containing row. Cover local axes, titles, and at least one shared-guide case or document the owner-level limitation. | Use layout snapshots/helpers where suitable; assert the relevant row/plot coordinates rather than implementation details. | test(core): cover collapsed overhang layouts |
| 3. Example and documentation | Change examples/docs/examples/generic/upsetr-mutations.json to use a top-oriented set-size axis and the proposed overhang property. Document the intentional-overlap semantics and the padding escape hatch; regenerate schema/docs artifacts if required. | Re-render the example and inspect the resulting image for the expected compact layout and acceptable overlap. | docs(core): document collapsed overhang |
| 4. Metadata compatibility | Evaluate mapping the app's titleReserve behavior to the generic reservation policy. Preserve title.reserve where it controls title positioning, and avoid removing titleReserve until generated metadata titles have equivalent behavior. | Keep existing metadata tests green and add a regression only if the implementation changes the generated title layout. | refactor(app): align metadata title reservation |

## Non-goals

- Automatic collision detection or z-index resolution.
- Changing the meaning of explicit padding.
- Removing title-specific reserve or the app-level titleReserve in the first implementation.

## Risks and acceptance criteria

The feature intentionally permits overlap, including overlap with neighboring
grid rows or other guide elements. Shared axes and app-specific custom
overhangs need explicit treatment because they are not all owned by the same
layout object.

The change is accepted when existing specs retain their current layout, the
UpSetR example loses the unnecessary inter-row gap, collapsed elements remain
visible, explicit padding still reserves space, and the behavior is documented
in the generated schema/docs.
