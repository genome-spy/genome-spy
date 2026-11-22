---
"@genome-spy/ui-components": minor
"@genome-spy/app": patch
---

<!-- category: feature -->

Publish reusable layouts, file inputs, dialogs, selection controls, data
previews, job progress, and form helpers in `@genome-spy/ui-components`.
Applications can import individual controls and theme them with scoped CSS
custom properties. The package includes a customizable segmented control,
keyboard-accessible tabs, and a Custom Elements Manifest for tooling. GenomeSpy
App and Playground use the shared components, which have flat buttons by
default. App preserves its beveled buttons in its own theme, including in
dialogs. App's dialog exports work alongside the new package.

App and Playground share PNG and SVG export dialogs. Playground offers separate
Save PNG and Save SVG actions, with PNG background controls and a preview of
which SVG layers will be rasterized.

App’s context menus and toolbar dropdowns and Playground’s Export, Renderer, and
More menus use the shared menu controller and stylesheet. Command menus support
checked choices, native links, and named groups. Themes can customize the menu
surface, row spacing, and interaction colors.

Import `@genome-spy/ui-components/form.css` and add `gs-form` to theme native
fields and buttons alongside the shared components.

Dialog helpers resolve a cancellation on ordinary closure, and `BaseDialog`
supports accessible descriptions for custom dialogs. Selection and threshold
controls accept accessible labels, multi-select reports search failures, and
data previews expose one keyboard-scrollable table.
