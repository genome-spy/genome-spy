---
"@genome-spy/core": patch
"@genome-spy/app": patch
"@genome-spy/doc-embed": patch
"@genome-spy/react-component": patch
---

WebGL rendering errors, such as invalid colors in a color scheme, now appear in
the visualization's error box, including in the playground. Errors from
interactive parameter and data updates, including debounced updates, are also
displayed. Embedded visualizations report these errors through `onError` when
provided.

Failed `embed()` calls now reject with the original setup error. Documentation
examples and React embeds display setup errors only once.
