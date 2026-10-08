---
"@genome-spy/core": patch
---

Keep locus axis ticks, labels, and grid lines within the visible range when
zoomed in closely. Tick visibility now follows base centers, including for
explicit index and locus axis values, so visible edge ticks are retained and
ticks beyond the viewport are removed.
