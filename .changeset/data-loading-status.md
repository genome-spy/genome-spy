---
"@genome-spy/core": minor
---

Inspect eager URL and lazy data-loading outcomes through the embed API's new
`dataLoading.getSnapshot()` and `dataLoading.subscribe()` methods. Embedders can
detect failed sources without reading the visualization or browser console.
Shared sources retain their status until disposal, and successful sources no
longer hide another source's error. The optional `getSpecOrigin` embed option
associates loading outcomes with authored specification fragments.
