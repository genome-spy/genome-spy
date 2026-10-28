---
"@genome-spy/core": minor
"@genome-spy/app": minor
---

<!-- category: feature -->

Add experimental Figwig support for multitrack signals and typed sample
metadata, with reactive track selection and cache reuse. Exact mode computes
missing-aware means from raw values; fast mode uses rounded, zero-filled
summaries for coarse overviews and raw values when zoomed in. The reader and
metadata adapter load on demand in ESM, while Core's minimal entry requires
explicit Figwig registration.
