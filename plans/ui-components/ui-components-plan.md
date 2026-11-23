# GenomeSpy UI components

Create the public `@genome-spy/ui-components` workspace for the split panel,
file picker, drop zone, and dialog primitives. Migrate App and Playground to the
shared implementations. Document how the focused apps can apply their own theme
and wrap the primitives in the existing app shell.

## Ownership and contracts

The new package owns browser UI and Lit styles. Core retains visualization APIs
and renderer lifecycle. App owns cohort dialogs and agent integration.
Playground owns editor state, dataset parsing, and image export orchestration.
The focused apps own their layout, file workflows, and state. See
`ARCHITECTURE.md`, `packages/app/APP_ARCHITECTURE.md`, and
`packages/app/APP_STYLE_GUIDE.md`.

- Publish JavaScript ESM and generated TypeScript declarations. Keep imports
  explicit with a separate registration module for each custom element. A root
  export of classes and helpers may re-export modules free of registration. Keep
  Lit as a peer dependency. Keep Font Awesome scoped to the modules that render
  its icons. Lion uses separate class and definition entries. The separation
  allows an application to import one control without evaluating all other
  definitions.
- Preserve App's `BaseDialog`, `showDialog`, and `showMessageDialog` exports at
  the root and `/dialog`. Keep the existing body mount default and accept an
  explicit mount container for scoped themes. Reuse native dialog behavior and
  support Playground's persistent export dialog, including reopening and
  preserving selected options. Dialog result and cleanup listeners match their
  own original event targets so nested dialogs can mount inside a dialog. Keep
  the example browser's specialized sheet behavior in Playground.
- Make the picker a native file input and accessible button backed by consistent
  file selection and repeat-selection behavior. Compose it into the drop zone.
  Keep App's `gs-files-chosen` event and `FileList` payload. Playground's Files
  pane keeps its parsing, multiple-file handling, and named-data behavior.
- Keep the split panel's existing orientation, reverse order, pointer identity,
  keyboard resizing, and slotted node identity. Keep the Files dock and focused
  app shell's specialized constraints independent.
- Use inherited `--gs-*` properties and local defaults. Preserve App's existing
  accent values and map Playground's palette where shared components run. A
  focused app can set the same tokens on its root. Document the public tokens
  and the dialog mount option. Expose parts for targeted styling.
- Ensure one module owns the shared dialog types and registrations in a normal
  npm bundle with App, UI, and App Agent. App's browser artifacts still resolve
  their own dependencies without a bundler. Production App currently builds the
  root and dialog entry separately and repeats registration. Verify browser and
  npm entry points with the real registry. Keep the existing standalone App CDN
  artifacts and build an npm ESM entry with the shared UI modules external. Use
  the same external modules from the App dialog adapter. Add source type
  mappings for workspace checks that run before declarations exist.

Reuse the existing MIT-licensed GenomeSpy code. Packaging reference
[Lion](https://lion.js.org/guides/how-to/get-started/) and styling reference
[Lit](https://lit.dev/docs/components/styles/) inform the design. The extraction
includes no upstream implementation code.

## Milestones

1. **Extract components.** Establish the workspace, publishable entries and
   typings, registration policy, and component styles. Move existing splitter
   coverage and add focused coverage for reusable contracts that lack coverage.
   Verify a packed consumer imports a single component with its own styles and
   definition. Tentative commit
   `feat(ui-components): extract reusable controls`.
2. **Migrate App and Playground.** Preserve the root and dialog API exports and
   migrate the metadata drop zone, Playground splitter, dataset picker, and
   export dialog. Exercise normal dialog open, close, and repeated use. Verify
   keyboard resizing in both orientations, retained editor and plot nodes, and
   uploading a fixture through Playground's Files pane. Tentative commit
   `refactor: adopt shared UI components in App and Playground`.
3. **Verify delivery and theming.** Include the package in build, preview, and
   release checks. Verify an App + App Agent production import without registry
   mocks and check two differently themed component hosts in a real browser.
   Check the documented focused-app token mapping in an isolated consumer.
   Tentative commit `build: include UI components in GenomeSpy releases`.

The implementation is complete when App and Playground use the shared paths,
unrelated components stay out of single-component production imports, and a host
can customize its own theme through scoped tokens. The first npm release will
require the package's publication setup.

## Implementation verification

The workspace package, App migration, and Playground migration are complete. The
monorepo build, release archive checks, and packed TypeScript imports passed.
The npm App root and dialog entry share UI class identity, and the standalone
App entry loaded by URL in Chromium. The packed component fixture verified
separate theme values for two containers, repeat selection, and drag-and-drop.
The Playground browser checks covered pointer and keyboard resizing, file
upload, and closing and reopening export with its selected format retained.

The focused apps can adopt the package using the theme example in the package
README.

## Snapshot expansion

Extract the searchable checkbox list, multi-select, custom select, data grid,
histogram, comparison operator buttons, and threshold input. Share the form
controller, field directive, and dialog wizard controller. Keep App's current
tags, values, events, and metadata/filter wiring. Keep histogram geometry
independent of Core and keep async search and select positioning with their
existing Floating UI implementation.

- Give each component a pure class export and an opt-in definition. The
  threshold input's definition registers its two child components. Keep App
  compatibility re-exports where its callers use shared types or require
  registration. Preserve the App bundle and CDN boundary from the first
  extraction.
- Extend the existing theme with inherited control surface and focus tokens.
  Expose targeted parts covering inputs, selection panels, and chart or grid
  containers. Keep the grid's virtual scrolling active across reconnect and use
  the same row height for sizing and scrolling.
- Add a package-owned Storybook with the repository's installed Web
  Components/Vite framework. Move the reusable App stories and add interactive
  examples for the initial extraction and form helpers. Share those stories with
  the App Storybook. Keep stories and tooling out of the npm archive.

Verify the App and UI package with focused tests and type checks. Build
Storybook and exercise a selection control, a composed threshold input, a
scrolling grid, and scoped colors in Chromium. Pack the workspace and verify
consumer typings and that a single split panel import excludes the new
components and dependencies. The local tarball is for testing. A hosted snapshot
can use the existing manual preview workflow after the branch is pushed.
Tentative commit: feat(ui-components): expand reusable controls and add a
Storybook.

The expansion is complete. Both Storybooks built, and all 16 package stories
rendered in Chromium. The browser checks covered the theme toolbar, async
selection, checkbox filtering, threshold composition, grid scrolling after
reconnect, and the validated dialog wizard. The packed snapshot resolved in an
isolated TypeScript consumer. A single component registration retained its
required dependencies, and package class imports registered no elements.

## Share image export dialogs

App currently owns separate PNG and SVG forms. Playground embeds a simpler
combined dialog. Move App's two forms into the shared package and give
Playground the same **Save PNG** and **Save SVG** commands in its desktop Export
menu and its compact More menu.

- Keep rendering and layer analysis in Core. The shared UI receives the size
  getter and `imageExport` methods from a small structurally typed source.
  Playground already has this shape on its embed result. App binds its current
  Core instance to the same shape.
- Expose the classes through an opt-in subpath and register the existing App
  tags through a scoped definition entry. App continues mounting a fresh dialog
  under its theme. Playground keeps one dialog for each format to retain the
  chosen settings and supplies the current embed when it opens.
- Retain App's PNG scale and background controls and its even-size policy. Let
  Playground start with the visualization background and use its actual canvas
  size. Keep SVG layer analysis, density options, and preview checks. Guard
  analysis results and downloads when a session closes or its source changes.
  Observe the host visualization for size changes during SVG export setup and
  remove those listeners when the dialog closes.
- Keep the existing native dialog focus and download behavior. Bound the export
  dialogs to the viewport so the full forms work on compact layouts. Move the
  tests for the shared controls with their implementation and cover the two
  Playground commands, settings retained on reopen, and real PNG and SVG
  downloads. Build both hosts and the package and show both forms in Storybook.

Implementation verified in Chromium with the App embedded in a clipped
container, the Playground toolbar in desktop and compact modes, and both export
stories. The release package resolves both entry points in a strict TypeScript
consumer with the published dependencies. App, Playground, and Storybook
production builds passed.

## Share the Playground toolbar menus

Migrate Export, Renderer, and compact More in a single change. Playground owns
its toolbar layout, commands, selection state, and palette. The ui-components
menu controller owns popup rendering, positioning, focus, and dismissal. App
continues to use the same command and controls APIs.

- Add native links, checked radio and checkbox actions, and named groups to
  command menus. Use the existing item model and activation path. Match ARIA
  roles to the action and let the host supply checked state. Expose first, last,
  or checked initial focus for anchored command menus.
- Anchor the shared popup to the toolbar's shadow buttons and mount it in
  Playground's light DOM layout. Use the browser's sequential focus order when
  leaving a shadow trigger's popup. Keep focus restoration before command
  callbacks so opening an export dialog still works. Add opt-in pointer light
  dismissal so switching triggers takes one click and other outside clicks reach
  their targets. The existing backdrop behavior remains the default.
- Keep anchored popups aligned and inside the viewport, including at compact
  sizes. Dismiss when a trigger becomes hidden or the toolbar disconnects. Map
  existing Playground variables to the shared menu surface and row styles.
  Remove the local popover rendering, positioning, and navigation code.
- Verify menu focus and dismissal, renderer selection and grouping, checkable
  actions, native new-tab links, viewport bounds, and real export downloads.
  Check existing shared menu examples and App consumers. Document the added menu
  options and show them together in Storybook.

The W3C [menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) and
[link example](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-links/)
guide the keyboard and native link semantics.

Verified the complete migration in Chromium, with keyboard, native-link, and
download flows also passing in Firefox and WebKit. App's command and controls
menus, tooltip suppression, the four menu stories, and the packed consumer
passed their checks. The compact group divider reaches the menu's border.

The independent API review added typed command item variants, consistent
disabled and submenu error behavior, and focus preservation for keyed rows.
Checks and icons share a leading slot, and the command row inset keeps the focus
highlight away from the border.

## Consume the standalone package

The component source, documentation, and publishing now live in
[genome-spy/ui-components](https://github.com/genome-spy/ui-components). App and
Playground use the published `0.2.0` release. The lockfile resolves both to one
copy of the package, and imports and types resolve through its public exports.
The standalone Storybook owns the shared examples, and App's Storybook covers
App-specific stories.
