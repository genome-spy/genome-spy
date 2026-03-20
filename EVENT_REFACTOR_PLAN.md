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

## Status

The architectural refactor is effectively complete on this branch.

Completed:

- internal interactions now run on `Interaction`, not on a separate
  `InteractionEvent` wrapper
- `mouseenter` / `mouseleave` are synthesized from pointed-path changes
- cursor resolution is centralized and supports declarative view / mark cursors
- drag interactions can suspend hover tracking centrally
- the legacy internal `(coords, event)` listener shape is gone
- shared routing mechanics have been extracted from `GridView` and `SampleView`
- context menus and dropdowns freeze pointer-derived interaction state globally
- internal runtime naming now uses `propagateInteraction(...)` and
  `handleInteraction(...)`

Remaining follow-up work is now ordinary cleanup and documentation rather than
foundational event-system redesign.

## Goals

- Support hierarchical pointer tracking across the view tree.
- Synthesize basic pointer transition events such as `mouseenter` and
  `mouseleave`.
- Centralize mouse cursor resolution so views and marks can define cursors.
- Make cursor selection declarative in specs, not only imperative in code.
- Decouple internal interaction dispatch from legacy listener assumptions.
- Reduce ad hoc behavior in container-specific `propagateInteraction(...)`
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

### 3. Dispatch and listener model

The internal event should carry the state needed by the dispatcher, such as:

- `type`
- `point`
- `uiEvent`
- `target`
- `currentTarget`
- `relatedTarget` for enter/leave-style transitions when applicable
- propagation flags
- wheel-claim state
- optional mark hit / datum hit information if available

The runtime on this branch now dispatches `Interaction` directly end to end.
There is no separate wrapper class in production anymore, and the internal view
listener contract is event-only.

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

- the interval selection rectangle mark can declare its cursor in the spec
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

- `View.addInteractionListener(...)`
- `View.removeInteractionListener(...)`

are internal APIs. They are widely used inside the monorepo, including by App,
but they are not considered stable external surface.

Current state:

- view-level listeners are still available internally as `Interaction`-only
  hooks
- the legacy `(coords, event)` compatibility layer has been removed
- supported embed APIs remain unchanged

Observation from the dispatcher introduction:

- the internal type should use the concise name `Interaction`
- the temporary migration path did not need to survive the full refactor; once
  internal consumers moved, the wrapper layer could be removed entirely

Observation from pointer transition synthesis:

- `mouseenter` / `mouseleave` can be synthesized from the resolved target path
  produced by the existing propagation pipeline
- this keeps the change set small, but the events are derived after the normal
  `mousemove` dispatch rather than from a separate target-resolution probe
- if any consumer later requires strict pre-move transition ordering, add a
  dedicated path-resolution pass instead of baking more policy into controller
  event handlers

Observation from cursor centralization:

- cursor ownership can be centralized in a controller-owned cursor manager
  without changing the supported embed API
- mark-over-view precedence and `ExprRef`-backed cursor updates work with a
  single active subscription to the currently resolved cursor source
- existing imperative cursor call sites can be migrated incrementally on top of
  this infrastructure rather than being rewritten in the same phase

Observation from consumer migration:

- consumer migrations can now remove event-system hacks directly; for example,
  metadata hover teardown can use `mouseleave` instead of an ancestor-level
  `mousemove` workaround
- interval-selection cursor migration needs one more design decision because it
  sits between user-declared cursor specs and internal transient interaction
  state

Observation after the interval-cursor design review:

- the interval-selection cursor should be declared on the selection-rectangle
  mark rather than on the surrounding view
- transient interaction state such as interval dragging should be exposed as an
  internal reactive param that cursor `ExprRef`s can read
- hover tracking should be suspended during active drag interactions and
  restored on release
- the same hover-suspension rule should apply consistently to interval dragging,
  viewport/scale panning, and scrollbar dragging

Observation from the drag-suspension implementation:

- drag-time hover suspension can be handled centrally through internal
  `ViewContext` hooks backed by the interaction controller
- the selection-rectangle cursor no longer needs imperative `canvas.style.cursor`
  writes; a mark-level cursor `ExprRef` plus an internal drag-state param is
  sufficient

Observation from typed-surface alignment:

- once synthetic interaction events exist at runtime, the authored spec surface
  must admit them too; otherwise schema validation and selection configuration
  drift apart
- `mouseenter` / `mouseleave` should therefore be part of the declared
  `DomEventType` vocabulary even though they are synthesized by GenomeSpy

Observation from listener API migration:

- an event-only internal listener API can coexist with the legacy
  `(coords, event)` surface as a thin compatibility layer while preserving
  listener registration order
- most internal consumers did not need `coords` at all; once the artificial
  App-side sample lookup dependency was removed, the legacy view listener API
  was no longer needed by production interaction code
- the remaining migration work is therefore less about callback shape and more
  about simplifying container propagation and wheel-specific interaction policy

Observation from the wheel-override cleanup:

- downstream interaction code should not depend on ad hoc replacement of
  `uiEvent` with lookalike objects
- wheel-specific behavior can be expressed as explicit interaction state
  instead, for example by overriding effective wheel deltas while retaining the
  original wheel event object

Observation from the partial propagation unification:

- the shared part of `GridView` and `SampleView` routing is smaller than a full
  target-resolution abstraction: capture/bubble framing, hit-tested surface
  dispatch, and optional post-dispatch hooks
- extracting just those mechanics removes the duplicated control flow without
  pretending that `SampleView` and `GridView` have the same interaction
  topology
- the remaining duplication is now mostly honest policy: wheel-claim behavior,
  content-specific zoom rules, and `SampleView`'s sidebar-versus-main-grid split

Observation from removing the legacy view listener API:

- once production code stopped using `(coords, event)` listeners, the
  compatibility layer could be removed cleanly without affecting the supported
  embed surface
- internal interaction dispatch is now event-only end to end; the awkward
  `coords` argument no longer shapes internal APIs

Observation from removing `InteractionEvent` from the runtime path:

- view propagation and synthesized enter/leave dispatch can now run directly on
  `Interaction` objects; the wrapper class is no longer needed in production
- this means the architectural migration is effectively complete: controller,
  dispatcher, propagation, and listeners all use the same internal interaction
  object

Observation from removing the wrapper class:

- `InteractionEvent` no longer exists as a separate execution path; tests and
  runtime now both exercise `Interaction` directly
- `packages/core/src/utils/interactionEvent.js` is now just a home for shared
  interaction-related utility functions and type guards
- at this point, the remaining work is no longer architectural refactoring but
  ordinary cleanup and follow-on feature work

Observation from the menu-freeze fix:

- context menus and dropdowns behave more coherently when they freeze
  pointer-derived interaction state globally instead of letting individual
  views guess at modal behavior
- the interaction controller is the right place for that freeze, because it
  already owns hover, cursor, and tooltip update timing

Observation from the naming cleanup:

- once `Interaction` became the actual runtime object, method names such as
  `propagateInteractionEvent(...)` and `handleInteractionEvent(...)` only added
  noise
- `propagateInteraction(...)` and `handleInteraction(...)` better match the
  current model and make the internal API read less like a half-retired DOM
  wrapper

## Remaining Follow-ups

The remaining items are smaller follow-on tasks rather than blockers for the
architecture:

- decide whether `packages/core/src/utils/interactionEvent.js` and
  `InteractionUiEvent` should be renamed to match the now-dominant
  `Interaction` terminology
- add or refine user-facing documentation for declarative cursors and the
  synthesized `mouseenter` / `mouseleave` semantics where that affects authored
  specs
- continue opportunistic cleanup when touching interaction-heavy code, but do
  not reopen the architecture unless a new capability truly requires it

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
- wheel claim probing with the new dispatcher in place

Regression coverage should include:

- point selection
- interval brushing and drag translation
- brush wheel zoom
- scrollbar dragging
- sample view context menus
- metadata hover highlighting

Each follow-on change should add or update the tests needed to lock down the
behavior being changed before additional cleanup continues.

## Execution Discipline

Each follow-on slice should still be executed as a small closed loop:

1. implement the planned change for that phase
2. add or update tests for the changed behavior
3. run the relevant test suites
4. review the results and revise this plan if observations suggest a better
   next step or reveal hidden coupling
5. commit the phase before starting the next one

This is intentionally stricter than a one-pass implementation plan. The event
system grew incrementally and exposed hidden assumptions during the refactor,
so the document should remain a living status note for the remaining cleanup.

## Phase Exit Checklist

Before moving from one follow-up slice to the next:

- the phase-specific code changes are in place
- the relevant tests have been added or updated
- the relevant test suites have been run successfully
- this plan has been revised if implementation observations warrant it
- the phase has been committed
