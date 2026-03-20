# Event Refactor Plan

## Background

GenomeSpy's `InteractionEvent` system has been useful as a shared mechanism for
routing canvas interactions through the view hierarchy. However, it has grown
incrementally around mouse-oriented interactions and now mixes several concerns:

- event dispatch through the view tree
- hover tracking
- zoom and wheel ownership
- scrollbar interaction
- tooltip side effects
- ad hoc cursor handling
- a limited public listener API

This has led to awkward gaps:

- no first-class `mouseenter` / `mouseleave` style events
- no centralized way to resolve the active mouse cursor
- duplicated dispatch policy in multiple container view types
- a legacy listener signature with an unused `coords` argument
- mutable / heterogeneous event payloads

The goal of this refactor is not to mimic the DOM. The goal is to provide a
coherent hierarchical interaction system for pointer tracking and view-local
behavior, while preserving the supported public API surface in
`packages/core/src/types/embedApi.d.ts`.

## Goals

- Support hierarchical pointer tracking across the view tree.
- Synthesize basic pointer transition events such as `mouseenter` and
  `mouseleave`.
- Centralize mouse cursor resolution so views and marks can define cursors.
- Make cursor selection declarative in specs, not only imperative in code.
- Decouple internal interaction dispatch from the legacy listener contract.
- Reduce ad hoc behavior in container-specific `propagateInteractionEvent(...)`
  implementations.

## Non-goals

- Full DOM event compatibility.
- A general-purpose event system for all browser events.
- Unifying keyboard events into the same pipeline in the first phase.
- Removing all existing event types or rewriting all interaction code at once.

## Design Principles

- Keep the public API stable, but stop using it as the internal design target.
- Treat only `embedApi.d.ts` as the stable compatibility boundary.
- Move interaction routing policy into a centralized dispatcher.
- Treat pointer tracking as stateful: dispatch depends on the previous pointer
  path as well as the current pointer position.
- Separate hit testing, event synthesis, dispatch, and side effects.
- Make cursor selection declarative and centrally applied.

## Proposed Architecture

Introduce a new internal interaction layer with three main parts:

1. Native input collection
2. Pointer state and event synthesis
3. Dispatch and legacy adaptation

### 1. Native input collection

`InteractionController` remains the entry point for native canvas events. Its
role should be narrowed to:

- reading native mouse / wheel / touch input
- converting screen coordinates to canvas coordinates
- triggering picking / hit-resolution updates
- passing normalized input to the internal dispatcher

The controller should no longer encode event propagation policy itself beyond
native-input concerns such as `preventDefault`, touch gesture extraction, and
wheel inertia timing.

### 2. Pointer state and event synthesis

Add a pointer-state component that tracks:

- current canvas point
- current hit path
- previous hit path
- current hovered mark hit, if any
- current resolved cursor

On each relevant input event, the dispatcher resolves the current interaction
path and synthesizes internal events.

For pointer movement, the system should support:

- `mousemove`
- `mouseenter`
- `mouseleave`

These should be synthesized by diffing the previous and current hit paths.

Behavior outline:

- if the pointer moves within the same target path, dispatch `mousemove`
- if the path changes, dispatch `mouseleave` for views no longer in the path
- dispatch `mouseenter` for newly entered views
- then dispatch `mousemove` on the current path
- if the pointer leaves the canvas or no view is hit, dispatch `mouseleave`
  for the previous path and clear hover state

This should remove the need for hacks that approximate leave behavior by
watching ancestor-level `mousemove`.

### 3. Dispatch and legacy adaptation

Split the event model in two:

- `Interaction`
- `LegacyInteractionEventAdapter`

The internal event should carry the state needed by the new dispatcher, such as:

- `type`
- `point`
- `uiEvent`
- `target`
- `currentTarget`
- `relatedTarget` for enter/leave-style transitions when applicable
- propagation flags
- wheel-claim state
- optional mark hit / datum hit information if available

The legacy adapter may temporarily preserve the current internal listener
contract during migration:

- `view.addInteractionEventListener(type, listener, useCapture)`
- listener signature `(coords, event)`

The adapter can continue passing `undefined` for `coords` initially, or compute
it later if that becomes useful. The important change is that internal code no
longer depends on this signature.

These methods are not part of the supported embed API and should be treated as
internal migration surface only. They do not need to constrain the final design.

## Hierarchy Model

The system needs a consistent notion of the "interaction path".

A path should represent the resolved view ancestry from root to deepest hit
view, with optional mark-hit metadata attached near the leaf.

Container views should stop hardcoding their own propagation rules as much as
possible. Instead, each view type should provide enough information for the
dispatcher to resolve:

- whether the pointer is inside the view
- which child, if any, is the active interaction child
- whether there are auxiliary interaction surfaces such as scrollbars

This suggests introducing view-level hooks such as:

- `resolveInteractionTarget(point)`
- `getInteractionChildren(point)`
- `getInteractionSurfaces(point)`

The exact API can be adjusted, but the key point is that dispatch should be
driven by a shared traversal contract rather than hand-written propagation logic
in every container view.

## Cursor Handling

Cursor handling should become a first-class responsibility of the interaction
layer, not a side effect hidden in listeners.

### Spec surface

Add a new `cursor` property to both:

- `ViewSpecBase`
- `MarkPropsBase`

The property should support:

- a static cursor string such as `"pointer"`, `"move"`, or `"grab"`
- an `ExprRef`

This makes cursor behavior declarative and allows it to participate in the same
reactive parameter machinery as other spec properties.

Example use case:

- the interval selection rectangle can declare its cursor in the spec
- by default the cursor expression resolves to `"move"`
- while the mouse button is down, a reactive param can flip the cursor to
  `"grab"` or `"grabbing"`

This should remove the need to encode cursor state transitions as imperative
listener side effects spread across interaction handlers.

### Cursor sources

Allow cursor definition at multiple levels:

- mark hit from `MarkPropsBase.cursor`
- view from `ViewSpecBase.cursor`
- container view behavior derived from the same view-level spec property

Each may provide either:

- a static cursor value
- an evaluated `ExprRef`
- an internal override for special transient cases when needed

### Cursor resolution

After the current interaction path has been resolved, the controller should pick
the effective cursor from the deepest applicable source upward. If no source
provides a cursor, restore the canvas default.

Expected precedence:

1. deepest hit mark cursor
2. deepest hit view cursor
3. ancestor view cursors outward toward the root
4. canvas default

The dispatcher / controller should evaluate any `ExprRef`-backed cursor against
the current reactive state before applying the resolved CSS cursor value.

This avoids the current problem where listeners can set a cursor but clearing it
requires fragile paired logic and pseudo-`mouseleave` workarounds.

### Schema and docs work

Because `cursor` would become part of user-visible spec surface, the refactor
should include:

- adding the property to `packages/core/src/spec/view.d.ts`
- adding the property to `packages/core/src/spec/mark.d.ts`
- generating updated schema / docs artifacts as needed
- documenting precedence and `ExprRef` support in user-facing terms

## Event Types

The internal system should support a focused set of interaction events.

Phase 1:

- `mousemove`
- `mouseenter`
- `mouseleave`
- `mousedown`
- `mouseup`
- `click`
- `dblclick`
- `contextmenu`
- `wheel`
- `wheelclaimprobe`
- `touchgesture`

Notes:

- `mouseenter` / `mouseleave` are synthesized hierarchical interaction events,
  not raw DOM pointer events.
- `wheelclaimprobe` remains an internal query event and should not leak further
  into public semantics than necessary.
- Keyboard events remain separate for now.

## API Compatibility

The supported compatibility boundary is the embed API in
`packages/core/src/types/embedApi.d.ts`.

That means the refactor must preserve supported APIs such as:

- `EmbedResult.addEventListener(...)`
- `EmbedResult.removeEventListener(...)`
- the rest of `EmbedResult`

By contrast, methods such as:

- `View.addInteractionEventListener(...)`
- `View.removeInteractionEventListener(...)`

are internal APIs. They are widely used inside the monorepo, including by App,
but they are not considered stable external surface.

Migration strategy:

- preserve view-level listener compatibility only as needed to migrate internal
  code incrementally
- do not treat the current `View` listener methods as long-term design
  constraints
- allow the final architecture to remove or replace them once internal call
  sites have been migrated

This allows a gradual migration:

- old code keeps working
- new internal code no longer needs to depend on `coords`
- internal event shape can be improved without exposing it externally

Observation from Phase 1:

- the internal type should use the concise name `Interaction`
- the compatibility layer can be a thin adapter from `Interaction` to the
  existing `InteractionEvent`-based propagation path while migration is still
  in progress

## Migration Plan

### Phase 1: Introduce internal dispatcher

- Add internal interaction dispatcher and pointer state tracking.
- Keep existing `InteractionEvent` and view-level listener methods only as
  temporary internal compatibility layer.
- Route current native event entry points through the dispatcher.

Exit criteria:

- Existing supported APIs still work, and internal interactions keep working
  through the compatibility layer.

### Phase 2: Add pointer path diffing

- Track previous and current interaction paths.
- Synthesize `mouseenter` / `mouseleave`.
- Dispatch leave events on canvas exit and equivalent touch termination.

Exit criteria:

- Existing hacks that emulate leave behavior can be replaced.

### Phase 3: Centralize cursor resolution

- Add cursor providers for views and marks.
- Apply cursor changes centrally from the controller.
- Remove listener-based cursor reset logic where present.

Exit criteria:

- Cursor changes and resets work without ad hoc `mousemove` bookkeeping.

### Phase 4: Migrate internal consumers

Migrate internal subsystems away from the legacy listener assumptions:

- metadata hover/highlight handling
- selection expansion context menu
- brushing and interval selection
- scrollbar interactions
- zoom and wheel ownership logic where practical

Exit criteria:

- New internal code no longer relies on `(coords, event)`.

### Phase 5: Simplify container propagation

- Replace duplicated `propagateInteractionEvent(...)` logic with shared
  traversal contracts.
- Minimize container-specific dispatch code to hit resolution only.

Exit criteria:

- event routing policy is mostly centralized
- view/container code is simpler and more declarative

## Risks

- The interaction model currently mixes view targeting with global picking /
  hover state. Untangling this may expose hidden assumptions in selection,
  tooltip, and zoom code.
- `wheelclaimprobe` is a pragmatic optimization and may remain a special case
  even after refactoring.
- Some internal code may depend on the exact timing of existing dispatch.
- Synthetic `mouseover` / `mouseout` semantics must be documented clearly so
  they are not mistaken for DOM pointer events.

## Testing Strategy

Add focused tests around:

- path diffing for `mouseenter` / `mouseleave`
- pointer leaving the canvas
- moving between sibling views
- moving between nested views
- cursor resolution precedence: mark over view over ancestor over default
- `ExprRef`-backed cursor evaluation on views and marks
- cursor updates driven by reactive params without pointer re-entry
- compatibility behavior for legacy listeners
- wheel claim probing with the new dispatcher in place

Regression coverage should include:

- point selection
- interval brushing and drag translation
- brush wheel zoom
- scrollbar dragging
- sample view context menus
- metadata hover highlighting

Each refactor phase should add or update the tests needed to lock down the
behavior being changed before broader migration continues.

## Execution Discipline

Each phase in the migration plan should be executed as a small closed loop:

1. implement the planned change for that phase
2. add or update tests for the changed behavior
3. run the relevant test suites
4. review the results and revise this plan if observations suggest a better
   next step or reveal hidden coupling
5. commit the phase before starting the next one

This is intentionally stricter than a one-pass implementation plan. The event
system has grown incrementally and contains hidden assumptions, so the plan
should be treated as a living document that is updated as each phase exposes
new constraints.

## Recommended First Implementation Slice

The lowest-risk first slice is:

1. introduce an internal dispatcher and path tracking
2. synthesize `mouseenter` / `mouseleave`
3. keep all old listeners working through an adapter
4. migrate the existing metadata highlight hack to the new events
5. add centralized cursor resolution after the transition events are proven

This gives immediate value by eliminating the worst hover hacks without forcing
a full rewrite of zoom, selection, or the supported embed API.

## Phase Exit Checklist

Before moving from one phase to the next:

- the phase-specific code changes are in place
- the relevant tests have been added or updated
- the relevant test suites have been run successfully
- this plan has been revised if implementation observations warrant it
- the phase has been committed
