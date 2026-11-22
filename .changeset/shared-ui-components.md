---
"@genome-spy/app": patch
"@genome-spy/playground": minor
---

<!-- category: feature -->

Save PNG and SVG in Playground with the same export dialogs as GenomeSpy App.

Playground offers separate Save PNG and Save SVG actions. The PNG dialog
supports scale and background settings, and the SVG dialog previews which layers
will be rasterized. Playground's toolbar menus support keyboard navigation and
announce the selected renderer.

App and Playground use controls from the standalone `@genome-spy/ui-components`
package. App gains keyboard-accessible tabs, accessible labels for selection and
threshold controls, and a keyboard-scrollable data preview. Applications can
theme the shared controls and native form fields with scoped CSS custom
properties.
