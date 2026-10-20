---
"@genome-spy/core": minor
"@genome-spy/app": patch
"@genome-spy/embed-examples": minor
---

Use parameters to update axis, legend, view-decoration, and canvas background
colors in initialized visualizations. Image exports use the current background,
and legend colors retain the parameter scope of their source views.

The default theme follows browser light/dark preference when its host opts in
with `color-scheme: light dark`. Unconfigured hosts stay light, and the canvas
remains transparent in both modes. Inherited `color-scheme` and the six
`--genome-spy-*` CSS properties customize its neutral colors and optional
background. Mode and host attribute changes update initialized visualizations
without polling; `api.refreshStyles()` applies other stylesheet changes.

The `defaultThemeColors` parameter exposes the complete resolved palette,
including facet headers and selection brush outlines. An explicit root
declaration opts out of automatic CSS updates. Explicit colors and data palettes
retain their precedence. The fixed `dark` preset also has consistent light guide
text. The App keeps a light color scheme to match its existing UI surfaces.

Interval selection brush `fill` and `stroke` colors accept expressions. Shared
brush appearance can be customized through the `selection-brush` style.

Canvas rendering reuses palette colors during each draw instead of evaluating
them for every instance, while preserving data-dependent color encodings.

The commented embedding example uses plain `embed` and a CSS-driven selector
for System, Light, Dark, and Custom appearances while preserving zoom and brush
selections.
