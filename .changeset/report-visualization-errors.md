---
"@genome-spy/core": patch
"@genome-spy/app": patch
"@genome-spy/doc-embed": patch
"@genome-spy/react-component": patch
---

Show layout, rendering, and reactive parameter or data update errors through
`onError` or the default centered error box, including errors from resize,
animation, and debounced updates. This makes failures such as invalid color
ranges visible in the playground.

Failed Core and App `embed()` calls reject with the original setup error and
release initialized resources. Cleanup or error-handler failures no longer mask
the original error. Documentation embeds and the React component display setup
errors only once.

Reactive update failures still throw the original error and reject pending
propagation barriers.
