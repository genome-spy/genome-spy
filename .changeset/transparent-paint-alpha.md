---
"@genome-spy/core": patch
---

<!-- category: fix -->

Honor alpha in CSS colors, including `transparent`, for GPU paint values and color
scale ranges. Point fill geometry and line-only shape fallback now account for
transparent strokes consistently across renderers.
