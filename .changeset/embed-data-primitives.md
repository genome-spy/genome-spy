---
"@genome-spy/core": minor
---

Read all loaded transformed records, or those inside a viewport or named interval brush, with
`ViewHandle.data.read({scope, limit})`. Bounds are applied before the record limit.
Replace native point-selection membership by `encoding.key` tuples with
`PointSelectionApi.setValue(keys)`, across mark types and existing conditional
encodings. Existing point-selection reads and subscriptions are unchanged.

Inherited point selections assign record identities to data views without enabling
picking or adding selection-only identity work to generated guides.
