---
"@genome-spy/core": minor
---

<!-- category: feature -->

Add `axis.tickEndpoints` to include ticks at the exact limits of a continuous
scale.

The ticks follow domain updates without changing the scale. An `"only"` mode
omits intermediate ticks, and the `"igv-axis"` style combines it with compact,
inward-flushed labels. Explicit `values` continue to take precedence, and
discrete axes ignore the option.
