---
"@genome-spy/core": minor
---

<!-- category: feature -->

Anchor scrollable views to the bottom or right with `anchor: "end"` in
`viewportHeight` or `viewportWidth` size objects. Views keep their distance from
that edge as dimensions change, align smaller content to it, and retain normal
manual scrolling. Step-sized views also stay synchronized during animated
navigation, avoiding transient jumps as row counts change.
