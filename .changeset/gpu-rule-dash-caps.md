---
"@genome-spy/core": patch
---

<!-- category: fix -->

Match GPU rule dash caps to SVG: round and square caps now apply to every dash,
including zero-length dashes. Outside borders follow the resulting silhouette,
and cap extensions can close small gaps without changing centerline dash lengths.
