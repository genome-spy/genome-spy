---
"@genome-spy/core": minor
---

Inspect and analyze currently loaded visualization data through the optional
`@genome-spy/core/view-query` entry. Scoped queries capture viewport, selection
and data revisions, support aggregation, and can return point references for
temporary labels, connectors and outlines. View handles expose scale access for
navigation.

Set `data.retainForInspection: true` to inspect source rows before view transforms
with `readSourceData`. Source descriptions report loading status, readiness and
published bounds; they do not guarantee complete lazy-source coverage. View
descriptions also expose configured visibility, ancestor visibility and opacity.
