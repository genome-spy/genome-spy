---
"@genome-spy/core": minor
---

Read loaded transformed records inside a viewport or named interval brush with
`ViewHandle.readData({scope, limit})`. Bounds are applied before the record limit.
Replace native point-selection membership by `encoding.key` tuples with
`PointSelectionApi.setValue(keys)`, across mark types and existing conditional
encodings. Existing point-selection reads and subscriptions are unchanged.
