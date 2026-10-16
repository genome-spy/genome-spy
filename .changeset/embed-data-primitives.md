---
"@genome-spy/core": minor
---

Read loaded transformed records with `ViewHandle.readData({limit})`, and replace
native point-selection membership by `encoding.key` tuples with
`PointSelectionApi.setValue(keys)`. Selection writes work across mark types and
drive existing conditional encodings and subscriptions. Applications keep control
of filtering, analysis, and dataset updates through existing APIs.
