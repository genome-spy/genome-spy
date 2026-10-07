---
"@genome-spy/core": patch
---

Show layout and rendering errors from resize and animation callbacks in the
visualization's error display and pass them to the embedding `onError` handler.
This fixes invalid color ranges leaving a partially rendered visualization with
only a console error, including in the playground.
