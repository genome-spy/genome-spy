---
"@genome-spy/app": minor
"@genome-spy/app-agent": minor
---

Save lasso polygon intent and its original axis mappings in App bookmarks and
undo/redo history, then rebuild selected rows from current data on restoration.
Replay waits for producer data and upstream selections before publishing results.
Agent parameter actions validate and accept the same region value.

Bookmark replay uses the CPU reference; points near polygon boundaries can differ
from the original GPU selection because of coordinate rounding.
