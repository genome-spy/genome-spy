---
"@genome-spy/core": patch
"@genome-spy/app": patch
---

Reject failed `embed()` calls with the original setup error instead of masking it
with a secondary error or returning an API for an uninitialized visualization.
Failed embeds release initialized resources and report the error through
`onError` or the default centered error box.
