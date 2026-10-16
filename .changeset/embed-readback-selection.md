---
"@genome-spy/core": minor
---

Add `ViewHandle.readData({limit})` to copy currently loaded transformed records
out of a visualization. Reads are bounded and detached, report truncation, and
never fetch data or apply viewport/brush filtering. Apps use existing named
scales and interval parameters to interpret and filter records themselves.

Add `PointSelectionApi.setValue(keys)` to replace native point-selection
membership through the source unit view's `encoding.key`. It works across mark
types, including text, and drives normal conditional encodings and subscriptions.
Inherited selections also render correctly when mouse picking is disabled.
