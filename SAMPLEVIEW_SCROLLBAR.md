# SampleView Scrollbar Plan

## Status

Implemented. This document now tracks follow-up observations and potential refinements.

## Critical review notes (potential fixes)

1. **Render-batch coupling to scrollbar coords**

- The scrollbar uses a stable `Rectangle` instance so buffered rendering sees dynamic updates. Keep this invariant; reassigning `#scrollbarCoords` in `updateScrollbar()` would regress behavior.
- ACTION: Add a comment in the code to warn future maintainers. Explain current rationale.

2. **Opacity vs. interaction threshold**

- Scrollbar interaction is disabled only when `peekState == 0`. Consider a small threshold (e.g., `peekState > 0.05`) to avoid invisible-but-interactive behavior during early transition frames.
- ACTION: Interaction is only needed when peekState > 0.95, e.g., when in the closeup view

3. **Minimum thumb length vs. scroll mapping**

- The min thumb length clamps size but doesn’t remap the scroll range, which can make dragging feel “faster” on large content. If needed, adjust the scroll mapping so the effective scroll range matches `maxScrollLength - minLength`.
- ACTION: Implement

4. **Sticky summary height source**

- The scrollbar uses `summaryViews.getSize().height.px` as the sticky summary height. If summaries become responsive or dynamic in the future, ensure this stays accurate during render-only passes.
- ACTION: No action needed

5. **Centralize scroll metrics**

- SampleView currently reconstructs scroll metrics in `onBeforeRender`. Consider a single `LocationManager.getScrollMetrics()` helper to avoid duplicated math and to centralize scroll behavior.
- ACTION: Implement

6. **Declarative visibility/opacity**

- Scrollbar opacity is set via `opacityFunction`. If declarative config is preferred, consider a dedicated view param to drive opacity.
- ACTION: Implement

7. **Sticky summary interaction region**

- If sticky summaries should also block scrollbar interaction, ensure hit-testing ignores the sticky summary band, not just the thumb.
- ACTION: No action needed

## Optional architecture improvements

- Introduce a `ScrollMetrics` helper or utility to compute `contentHeight`, `maxScrollOffset`, and thumb length in a pure way (easier to unit test).
  - ACTION: Implement
- Consider a reusable “scrollable region with inset” abstraction (top/bottom insets for sticky summaries) so GridView/SampleView share the same logic.
  - ACTION: Implement if it increases testability and has minimal increase in the amount of code.
