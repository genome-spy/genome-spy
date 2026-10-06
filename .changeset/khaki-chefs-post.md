---
"@genome-spy/core": minor
---

Scrollable views can now be scrolled by dragging, vertically or horizontally. In a view with `viewportHeight` or `viewportWidth`, dragging scrolls its content with the same momentum as panning, instead of requiring the scrollbar. Zoomable scales keep their existing behaviour: dragging still pans them.

When a drag can scroll, it follows its main direction after the first few pixels, so scrolling a tall view does not also pan it sideways.
