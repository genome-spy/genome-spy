---
"@genome-spy/core": patch
---

Fix Shift-clicking points when a point selection uses `push: "outer"` to share
its value across views. Adding or removing points now reads the shared selection
instead of throwing an error after an ordinary click.
