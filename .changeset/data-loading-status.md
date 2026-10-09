---
"@genome-spy/core": minor
---

Inspect eager URL and lazy data-loading outcomes through the embed API's new
`dataLoading.getSnapshot()` and `dataLoading.subscribe()` methods. Embedders can
detect failed sources without reading the visualization or browser console.
Shared sources retain their status until disposal, and successful sources no
longer hide another source's error. The optional `getSpecOrigin` embed option
links loading outcomes to data definitions in a specification.
Processing failures include buffered transforms and final data publication.

`awaitVisibleLazyData()` waits for publication to finish and rejects when a required
source fails, including a failure already recorded before the wait, so automated
validation and capture can finish promptly without retrying failed requests.
Tracks hidden by their own visibility or an ancestor do not participate.

Playground now underlines failed data declarations and shows the loading error
on hover. Confirmed requests to a single URL highlight that URL; processing and
ambiguous lazy-source failures highlight the enclosing data configuration.
Diagnostics follow formatting changes and clear when the source succeeds or
the specification changes.
