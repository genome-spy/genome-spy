---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Add opt-in cooperative wheel behavior to Core and App embeds so ordinary wheel
input scrolls the page or an overflowing view, while Ctrl+wheel retains chart
navigation and authored wheel selections. Viewport and sample scrolling applies
wheel deltas directly without added inertia and passes further scrolling outward
at boundaries. Embedding applications provide their own Ctrl-zoom hints.
