---
"@genome-spy/core": patch
---

Show errors from reactive parameter and data updates, including debounced updates,
in the visualization's error display or through `onError`. The failing update
still throws the original error and rejects pending propagation barriers.
