---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Brush numeric ranges directly on continuous color legends and combine them with
ordinary selection predicates across linked charts. Reaching the legend's
numeric maximum removes the upper limit while keeping the full color key stable.
Range brushes also work in sample-pane legends.
Open ranges survive App bookmarks and undo/redo.
Interval APIs read and clear shared values independently of brush hosts, and
programmatic replacement cancels active gestures without restoring stale bounds.
