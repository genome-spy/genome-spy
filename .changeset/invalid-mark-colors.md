---
"@genome-spy/core": patch
---

<!-- category: fix -->

Report invalid literal mark and encoding colors consistently across renderers
instead of throwing an opaque WebGL error or silently drawing black points with
Canvas. Playground highlights the offending color value, including inherited
encodings and conditional values.
