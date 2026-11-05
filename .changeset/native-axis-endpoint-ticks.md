---
"@genome-spy/core": minor
---

<!-- category: feature -->

Add `axis.tickEndpoints` to include ticks at the exact limits of a continuous
scale.

The ticks follow domain updates without changing the scale. Explicit `values`
continue to take precedence, and discrete axes ignore the option.
