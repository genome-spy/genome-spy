---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Add `api.views.visibility` to hide and show named views without disposing their
data, parameters or selections.

Visibility changes share the view mutation queue and initialize newly shown data
only when needed. GenomeSpy App uses its existing Redux and bookmark state for
the same API.
