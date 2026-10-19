---
"@genome-spy/core": minor
---

Use parameters to update axis, legend, view-decoration, and canvas background
colors in initialized visualizations. Image exports use the current background,
and legend colors retain the parameter scope of their source views.

The default theme exposes an ephemeral `themeColors` parameter for changing its
neutral colors and background together. Explicit colors and data palettes retain
their precedence. Facet headers follow the palette, and the fixed `dark` preset
also has consistent light guide text.

Canvas rendering reuses palette colors during each draw instead of evaluating
them for every instance, while preserving data-dependent color encodings.
