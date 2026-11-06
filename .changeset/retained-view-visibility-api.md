---
"@genome-spy/core": minor
---

<!-- category: feature -->

Add `api.views.visibility` to hide and show named views without disposing their
data, parameters or selections.

Visibility changes share the view mutation queue and initialize newly shown data
only when needed. Hosts that supply their own visibility predicate keep
ownership; API writes reject rather than introduce a second visibility store.
