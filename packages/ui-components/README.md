# GenomeSpy UI Components

Reusable Lit web components used across GenomeSpy apps, including GenomeSpy App
and Playground. They are free to use under the MIT license. The APIs may change
in any release.

Install `@genome-spy/ui-components` with Lit 3.

## Use a component

Import the registration module for each element you use.

```js
import "@genome-spy/ui-components/define/splitPanel";
import "@genome-spy/ui-components/define/filePicker";
```

```html
<gs-split-panel orientation="horizontal" style="height: 24rem">
  <div slot="preview" data-pane-label="Preview">Preview</div>
  <div slot="settings">Settings</div>
</gs-split-panel>
<gs-file-picker accept=".csv" multiple>Choose datasets</gs-file-picker>
```

Split panel children use unique named slots. Set `orientation="vertical"` to
stack panes and `reverse` to reverse their display order.

`<gs-tabs>` uses a `.tabs` array of `{ value, label }` entries. Give each panel
a `slot` matching its tab's value and give the tab list an accessible `label`.
Import `@genome-spy/ui-components/define/tabs` to register it.

The file picker emits a bubbling, composed `gs-files-chosen` event with a
`FileList` in `event.detail.files`. It also exposes `openPicker()` for opening
the picker from a user gesture. Use `define/dropZone` for
`<gs-upload-drop-zone>`, which includes the picker and emits the same event on
drop.

Class and utility imports from the package root or a component subpath leave
registration to the caller. `showMessageDialog()` registers the message dialog
on first use. Use `define/messageDialog` to register its tag for use in markup.

## Theme components

Set CSS custom properties on the component or an ancestor. Built-in defaults
keep the controls usable when a host supplies no theme.

```css
.workspace {
  --gs-theme-primary: #255f68;
  --gs-theme-on-primary: white;
  --gs-focus-color: #357f89;
  --gs-control-border: #cdd8dd;
  --gs-divider-color: #aac7ce;
  --gs-button-background: white;
  --gs-hover-background: #e5f1f1;
  --gs-selected-background: #dcebee;
  --gs-dialog-background: #fff;
  --gs-split-panel-divider: #aac7ce;
}
```

GenomeSpy App uses a scoped theme with beveled buttons. Playground maps its
accent and surface properties to the component tokens at the workspace root. A
focused app can set the same properties on its app-shell host. The file picker
exposes the `button` part, the drop zone exposes `drop-zone` and
`picker-button`, and the split panel exposes `handle`.

Dialogs support `--gs-font-family`, `--gs-font-size`, `--gs-basic-spacing`,
`--gs-dialog-text`, `--gs-dialog-radius`, and `--gs-dialog-backdrop` in addition
to the color tokens above. They expose `dialog`, `header`, `body`, and `footer`
parts, plus `button` and `primary-button` for their actions. Pass the themed
container as `mount` for dialogs opened by a helper. Modal dialogs use the
browser's top layer, so they can inherit a local theme and still extend beyond
the mount's bounds.

```js
import { showMessageDialog } from "@genome-spy/ui-components/messageDialog";

await showMessageDialog("The dataset is ready.", {
  title: "Import complete",
  mount: document.querySelector(".workspace"),
});
```

Subclass `BaseDialog` from `/dialog`, register the subclass, and call
`showDialog(tagName, configure, { mount })` to open it and await its result. For
persistent dialogs, set `openOnConnect` to false and call `openDialog()` after
the element's first render.

## Style native forms

Import the optional stylesheet and add `gs-form` to a form or a wrapper around
several forms.

```js
import "@genome-spy/ui-components/form.css";
```

```html
<form class="gs-form">
  <label>Dataset name <input name="dataset" /></label>
  <button type="submit">Save</button>
</form>
```

Native fields and buttons under `.gs-form` use the same `--gs-*` theme as the
components. For a form rendered inside a Lit shadow root, add the exported
`formStyles` from `@genome-spy/ui-components/styles` to the element’s
`static styles`. See **Theming → Scoped palettes → Native Form Controls** in
Storybook to compare the two kinds of controls.

## Context menus and dropdowns

Import the controller and its stylesheet. Use one controller for a group of
triggers that should share one open menu.

```js
import { createMenuController } from "@genome-spy/ui-components/contextMenu";
import "@genome-spy/ui-components/contextMenu.css";

const menu = createMenuController();
const options = {
  label: "Plot actions",
  mode: "command",
  items: [{ label: "Reset zoom", callback: resetZoom }],
};

plot.addEventListener("contextmenu", (event) =>
  menu.contextMenu(options, event)
);
button.addEventListener("click", () => {
  if (menu.isDropdownOpenFor(button)) {
    menu.dismissDropdownMenu();
  } else {
    menu.dropdownMenu(options, button);
  }
});
```

Use `mode: "command"` for actions with arrow-key navigation. Anchored dropdowns
default to `mode: "controls"`. Pass a Lit template as an item’s `customContent`
to embed form controls. The **Context Menu → Controls** story demonstrates Tab
navigation and focus return.

Call `dropdownMenu()` again with the same anchor and mode to update it in place.
Pass an `interactionBoundary` for related controls that can receive focus while
the popup stays open. To make those controls clickable, position them above the
backdrop. Use `onOpen` to acquire host state for the lifetime of the popup and
return a function that releases it on dismissal.

The popup and backdrop mount on `document.body` by default. Pass a connected
light DOM container as `mount` to inherit a scoped theme. Call
`dismissDropdownMenu()` before removing that container. For viewport-relative
positioning, mount outside ancestors that establish a fixed containing block,
such as transformed containers. Set `--gs-menu-background`, paired with the
shared `--gs-control-text`, `--gs-hover-background`, `--gs-selected-background`,
`--gs-divider-color`, and `--gs-focus-color` tokens on the mount or an ancestor.
Use `--gs-menu-current-border` for the current history entry's accent border.
Optional `--gs-menu-backdrop-z-index` and `--gs-menu-layer-z-index` tokens
coordinate the layers with other UI. The **Context Menu** story uses a scoped
mount so you can switch palettes in the Storybook toolbar.

## Job progress

Bind an activity to `<gs-job-progress>` and update it when the job changes
state. Listen for `gs-job-cancel` to request cancellation from your job runner.

```js
import "@genome-spy/ui-components/define/jobProgress";

const indicator = document.querySelector("gs-job-progress");
indicator.activity = {
  label: "Downloading dataset",
  startedAt: Date.now(),
  status: "running",
};
indicator.progress = 0.42;
```

Use `progress = null` for indeterminate progress and `startedAt: null` for an
unknown start time. Supply `finishedAt` for `complete`, `failed`, or `cancelled`
jobs to show the final elapsed time. Use the `message` and `cancel` slots for
custom contents, or set `cancel-label` to rename the built-in button. The bar
uses `--gs-theme-primary` and `--gs-divider-color`. Set
`--gs-job-message-height` to adjust the reserved message space.

## Selection and data preview

| Component                  | Element                         | Use                                  |
| -------------------------- | ------------------------------- | ------------------------------------ |
| `SearchableCheckboxList`   | `gs-searchable-checkbox-list`   | Filter and select known values       |
| `MultiSelect`              | `gs-multi-select`               | Search for values and select tags    |
| `CustomSelect`             | `gs-custom-select`              | Pick one rich option                 |
| `DataGrid`                 | `gs-data-grid`                  | Preview records in a scrollable grid |
| `Histogram`                | `gs-histogram`                  | Show a distribution and thresholds   |
| `SegmentedControl`         | `gs-segmented-control`          | Pick one value from a short list     |
| `ThresholdComparisonInput` | `gs-threshold-comparison-input` | Enter a threshold with a histogram   |

Each element has a `define/` entry, such as
`@genome-spy/ui-components/define/multiSelect`. Set a height on the grid so it
can virtualize the visible rows. Its `rowHeight` property sets the height of
each row in pixels. Use `FormController` and `formField` to validate input
within a Lit component, and `DialogWizardController` to manage dialog steps.

- Use `--gs-control-text`, `--gs-control-background`, `--gs-control-border`, and
  `--gs-control-radius` for common control styling. `--gs-divider-color` applies
  to separators such as grid rows and dialog footers.
- Buttons use solid fills by default. Use `--gs-button-background` for ordinary
  buttons and `--gs-hover-background` and `--gs-selected-background` for button
  and option states. Use `--gs-button-hover-background` and
  `--gs-button-selected-background` to set button states independently of
  options. These button backgrounds accept gradients.
- Use `--gs-button-shadow` and `--gs-button-selected-shadow` to add depth to
  ordinary and pressed buttons. Primary dialog buttons use `--gs-theme-primary`
  and `--gs-theme-on-primary`. To give them custom fills or gradients, set
  `--gs-primary-button-background` and `--gs-primary-button-hover-background`.
- Use `--gs-focus-color` for focus, and `--gs-muted-text`,
  `--gs-disabled-background`, and `--gs-disabled-text` for secondary or disabled
  content.
- Use `--gs-histogram-background` for the plot surface. The threshold comparison
  input uses `--gs-theme-primary` and `--gs-control-border` for its two bar
  colors. A standalone histogram also accepts a `colors` array.

## Storybook

From the monorepo root, run `npm -w @genome-spy/ui-components run storybook` and
open the local URL shown in the terminal. The **Theme** toolbar previews the
default, Playground, and focused-app palettes. Open **Theming → Scoped
palettes** to compare the Playground and focused-app styles with copyable CSS.
The **Button Styles** story compares the shared default with GenomeSpy App's
button theme. The dialog story demonstrates a validated multi-step form.

Open a component's **Docs** page for its public properties, attributes, events,
slots, styling hooks, and examples. The package also ships a
[Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/),
available as `@genome-spy/ui-components/custom-elements.json`.

Run `npm -w @genome-spy/ui-components run build-storybook` to build a static
showcase under `build/storybook` in the package.
