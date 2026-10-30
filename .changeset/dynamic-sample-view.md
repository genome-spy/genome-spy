---
"@genome-spy/core": patch
---

<!-- category: fix -->

Release keyboard handlers and Figwig readers when views are removed, and clean up
partially constructed view subtrees after failed insertion. Awaited removal now
finishes closing retained readers before consumers release their source URLs.
