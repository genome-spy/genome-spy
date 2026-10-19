---
"@genome-spy/core": minor
"@genome-spy/embed-examples": minor
---

Use parameters to update axis, legend, view-decoration, and canvas background
colors in initialized visualizations. Image exports use the current background,
and legend colors retain the parameter scope of their source views.

The default theme exposes a `themeColors` parameter for changing its neutral
colors and background together, including facet headers and selection brush
outlines. Explicit colors and data palettes retain their precedence. The fixed
`dark` preset also has consistent light guide text.

Interval selection brush `fill` and `stroke` colors accept expressions. Shared
brush appearance can be customized through the `selection-brush` style.

Canvas rendering reuses palette colors during each draw instead of evaluating
them for every instance, while preserving data-dependent color encodings.

The commented light/dark embedding example shows how to bridge CSS colors and
browser preferences to an existing visualization while preserving zoom and
brush selections.
