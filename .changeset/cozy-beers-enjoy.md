---
"@genome-spy/core": patch
---

<!-- category: fix -->

Defer drawing triggered by resize or scheduled layout updates until startup
preparation completes. This prevents startup from failing when generated legend
or facet labels become ready before their fonts.
