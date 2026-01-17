# SampleView Scrollbar Plan

## Overview
Add a vertical scrollbar that is always visible and smoothly transitions its thumb size and position during peek transitions. The scrollbar should ignore sticky summaries when computing content height, and it should render over the right edge of the child viewport with no extra padding. Prefer reusing the existing `GridChild.scrollbars` plumbing if feasible; otherwise, implement the cleanest minimal alternative.

## Phase 0 — Confirm scrollbar TODOs impact (analysis-only)
- **Variable-height contentCoords**: current `Scrollbar.updateScrollbar` assumes a static `contentCoords` size and is called only during layout; for SampleView, content height changes during peek transitions. We will ensure `updateScrollbar` is called every render using dynamic rectangles so size/position stays in sync.
- **Minimum thumb size**: optional enhancement. If implemented, it must preserve correct proportional scrolling (i.e., adjust effective scroll range or clamp thumb size and recompute max scroll length). This can be a follow-up if needed.

## Phase 1 — Expose scroll metrics in LocationManager
Goal: Surface scroll state and scrollable content height so the scrollbar can be synchronized without poking private fields.

Planned changes:
- Add public getters/setters on `LocationManager`:
  - `getScrollOffset()` / `setScrollOffset(value)` (clamp to valid range)
  - `getScrollableHeight()` (current scrollable content height)
  - `getPeekState()` (0..1), or a combined `getScrollMetrics(viewportHeight)`
- Ensure setters trigger render/update hooks consistent with current wheel handling.

Tests: run full test suite after this phase.

## Phase 2 — Make Scrollbar safe and externally syncable
Goal: Allow SampleView to drive scrollbar state and propagate drag back to LocationManager.

Planned changes:
- Guard `scrollOffset` getter so it returns 0 when `#maxViewportOffset <= 0` or `#maxScrollOffset <= 0`.
- Add a callback or method to notify external scroll changes (e.g., `onViewportOffsetChange` passed in constructor or `setViewportOffset(value, { notify })`).
- Ensure the drag handler uses the notify path.

Tests: run full test suite after this phase.

## Phase 3 — Wire Scrollbar into SampleView via GridChild
Goal: Use the existing `GridChild.scrollbars` structure and render/update it from SampleView.

Planned changes:
- Prefer creating `gridChild.scrollbars.vertical` for the SampleView child (if not already created) and let it live alongside axes/backgrounds.
- During `SampleView.render`, compute:
  - `viewportCoords = childCoords`
  - `contentHeight` based on peek state and scrollable height (ignoring sticky summaries):
    - Example: `contentHeight = lerp(viewportHeight, scrollableHeight, peekState)`
  - `contentCoords = viewportCoords.modify({ height: () => contentHeight })`
- Call `scrollbar.updateScrollbar(viewportCoords, contentCoords)` on every render so the thumb reacts to transitions.
- Render the scrollbar after content rendering so it appears on top.

Tests: run full test suite after this phase.

## Phase 4 — Sync interactions (wheel + drag)
Goal: Keep wheel scrolling and drag scrolling consistent.

Planned changes:
- Wheel handler: after `LocationManager.handleWheelEvent`, update scrollbar viewport offset with `notify: false` and request render.
- Drag handler: on scrollbar drag, call `LocationManager.setScrollOffset(newOffset)`, update sample range, and request render.
- Ensure interaction routing in `SampleView.propagateInteractionEvent` checks the scrollbar hit-test first, mirroring `GridView` behavior.

Tests: run full test suite after this phase.

## Notes
- Scrollbar always visible, even in bird’s-eye view; if `contentHeight <= viewportHeight`, thumb fills the track and drag is effectively inert.
- Sticky summaries are excluded from content height calculations as requested.
- If GridChild proves incompatible for SampleView, fall back to owning a scrollbar in SampleView, but keep rendering and interaction behavior the same.
