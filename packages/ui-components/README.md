# GenomeSpy UI Components

Lit web components used by GenomeSpy App and Playground. Install
`@genome-spy/ui-components` with Lit 3.

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
  --gs-dialog-background: #fff;
  --gs-split-panel-divider: #aac7ce;
}
```

App can use its existing `--gs-theme-primary` token. Playground maps its accent
and surface properties to the component tokens at the workspace root. A focused
app can set the same properties on its app-shell host. The file picker exposes
the `button` part, the drop zone exposes `drop-zone` and `picker-button`, and
the split panel exposes `handle`.

Dialogs support `--gs-font-family`, `--gs-font-size`, `--gs-basic-spacing`,
`--gs-dialog-text`, `--gs-dialog-radius`, and `--gs-dialog-backdrop` in addition
to the color tokens above. They expose `dialog`, `header`, `body`, and `footer`
parts. Pass the themed container as `mount` for dialogs opened by a helper.

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

## Selection and data preview

| Component                   | Element                          | Use                                  |
| --------------------------- | -------------------------------- | ------------------------------------ |
| `SearchableCheckboxList`    | `gs-searchable-checkbox-list`    | Filter and select known values       |
| `MultiSelect`               | `gs-multi-select`                | Search for values and select tags    |
| `CustomSelect`              | `gs-custom-select`               | Pick one rich option                 |
| `DataGrid`                  | `gs-data-grid`                   | Preview records in a scrollable grid |
| `Histogram`                 | `gs-histogram`                   | Show a distribution and thresholds   |
| `ComparisonOperatorButtons` | `gs-comparison-operator-buttons` | Pick a numeric comparison operator   |
| `ThresholdComparisonInput`  | `gs-threshold-comparison-input`  | Enter a threshold with a histogram   |

Each element has a `define/` entry, such as
`@genome-spy/ui-components/define/multiSelect`. Set a height on the grid so it
can virtualize the visible rows. Its `rowHeight` property sets the height of
each row in pixels. Use `FormController` and `formField` to validate input
within a Lit component, and `DialogWizardController` to manage dialog steps.

Controls share `--gs-control-background`, `--gs-control-border`, and
`--gs-control-radius` where applicable. The option focus outline uses
`--gs-focus-color`. The histogram background uses `--gs-histogram-background`.

## Storybook

From the monorepo root, run `npm -w @genome-spy/ui-components run storybook` and
open the local URL shown in the terminal. The **Theme** toolbar previews the
default, Playground, and focused-app palettes. The dialog story demonstrates a
validated multi-step form.

Run `npm -w @genome-spy/ui-components run build-storybook` to build a static
showcase under `build/storybook` in the package.
