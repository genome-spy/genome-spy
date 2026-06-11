# Plot Bookmarks Plan

## Goal

Allow GenomeSpy bookmarks to include sample attribute plots without treating modal dialogs as persistent application state.

Plots should behave as bookmark attachments: a bookmark restores the visualization state as it does today, then presents any attached plots together with the bookmark information box. The plot dialog remains a temporary viewer and creation surface.

## Current Situation

- Bookmark entries store provenance actions, named scale domains, and view settings.
- Bookmark restore submits saved actions, restores view settings, and reapplies scale domains.
- Sample attribute plots are generated as transient `SampleAttributePlot` objects and displayed in modal dialogs or agent chat messages.
- Plot dialogs do not dispatch provenance actions and are not represented in bookmark schema.
- Agent chat plots can be ignored for the first implementation because the agent is still experimental.

## UX Direction

### Restoring Bookmarks

- Restore the normal visualization state first.
- Show the bookmark info box as today.
- If the bookmark has attached plots, show a “Plots” section in or adjacent to the bookmark info box.
- Render each plot immediately as a compact preview with its title. Do not require the user to expand a collapsed section before the chart is visible.
- Provide actions for each plot:
  - open larger in the existing plot dialog
  - download PNG if the preview has a rendered chart instance

### Creating Bookmarks From Plot Dialogs

- Add an action to the plot dialog: “Bookmark with this plot”.
- The action creates a bookmark from the current visualization state and attaches the current plot request.
- The plot dialog remains modal; it does not become bookmark state.
- The resulting bookmark creation flow should reuse the existing title/notes dialog.
- The plot dialog should expose dialog-styled equivalents of the toolbar bookmark and share actions:
  - save a local bookmark with the current plot
  - create a share link with the current plot
- Because the plot dialog is modal, this must be the primary creation path for plot bookmarks. The toolbar and bookmark list are not reachable while the user is viewing a plot.

### Creating Bookmarks From The Toolbar

- Keep toolbar-created bookmarks focused on visualization state by default.
- Do not rely on toolbar actions for plots currently shown in a modal dialog.
- Toolbar-created bookmarks do not need an “Include current plot” option unless the app later gains a non-modal plot surface.

### Updating Existing Bookmarks

- Preserve existing plot attachments when updating a bookmark’s visualization state from the toolbar.
- Defer adding the current plot to an existing bookmark from the plot dialog. The first version only creates a new local bookmark or share link from the active plot.
- Updating plot attachments should not implicitly overwrite the bookmark’s visualization state.
- The bookmark info box can later become the central editor for removing plot attachments; this can be postponed if the first slice only adds and restores plots.

## Data Model

Add plot attachment data to `BookmarkEntry`.

Reuse existing plot request and attribute identifier types instead of defining a parallel bookmark-specific plot language. `SampleAttributePlotRequest` already captures the stable inputs needed to rebuild bar plots, boxplots, and scatterplots, and it already uses `AttributeIdentifier`.

Recommended shape:

```ts
import type { SampleAttributePlotRequest } from "../charts/sampleAttributePlotTypes.js";

interface BookmarkPlotAttachment {
    kind: "sample_attribute_plot";
    request: SampleAttributePlotRequest;
}

interface BookmarkEntry {
    plots?: BookmarkPlotAttachment[];
}
```

Store compact `SampleAttributePlotRequest` values, not generated renderable plots. The attachment wrapper should not carry a separate title. If a caller needs a user-provided title later, it should belong to the request type or another reusable plot descriptor, not to the bookmark-only wrapper. The generated plot contains derived rows, chart specs, summaries, titles, and characterization data. Rebuilding from existing request and identifier types keeps bookmarks compact and tied to the current metadata and sample hierarchy.

The first implementation should support:

- bar plots: one categorical sample attribute
- boxplots: one quantitative sample attribute
- scatterplots: two quantitative sample attributes

## Implementation Sequence

### Commit 1: Add Bookmark Plot Attachment Types

Tentative commit message:

```text
feat(app): add plot attachment bookmark types
```

Files to inspect and likely modify:

- `packages/app/src/charts/sampleAttributePlotTypes.d.ts`
- `packages/app/src/bookmark/databaseSchema.d.ts`
- `packages/app/src/appTypes.d.ts`

Tasks:

- Export or reuse `SampleAttributePlotRequest` without creating a duplicate request type.
- Add `BookmarkPlotAttachment` with `kind: "sample_attribute_plot"` and `request: SampleAttributePlotRequest`.
- Add optional `plots?: BookmarkPlotAttachment[]` to `BookmarkEntry`.
- Do not add a separate title field to `BookmarkPlotAttachment`.
- Treat missing `plots` as an empty list everywhere.
- Avoid introducing bookmark-only plot request or attribute identifier types unless an existing type cannot express a required user-visible behavior.

Tests:

- Extend bookmark type-level usage where needed.
- No runtime tests are required for this commit if it only changes `.d.ts` files, but run focused TypeScript checks if available.

### Commit 2: Preserve Plot Requests On Generated Plots

Tentative commit message:

```text
feat(app): preserve sample attribute plot requests
```

Files to inspect and likely modify:

- `packages/app/src/charts/sampleAttributePlotTypes.d.ts`
- `packages/app/src/charts/hierarchySampleAttributePlots.js`
- `packages/app/src/sampleView/plotMenuItems.js`
- `packages/app/src/agentApi/index.js`
- `packages/app/src/charts/hierarchySampleAttributePlots.test.js`
- `packages/app/src/agentApi/index.test.js`

Tasks:

- Add `request: SampleAttributePlotRequest` to `SampleAttributePlot`.
- Build bar, boxplot, and scatterplot request objects at the point where attribute identifiers are still available.
- For context-menu plots, pass stable `AttributeIdentifier` values from `attributeInfo.attribute`.
- For agent plots, keep using the existing request path and copy the request onto the generated plot.
- Add tests asserting that generated bar, boxplot, and scatterplot plots include the expected `request`.

### Commit 3: Share Bookmark Assembly Between Toolbar And Plot Dialog

Tentative commit message:

```text
refactor(app): share bookmark state assembly
```

Files to inspect and likely modify:

- `packages/app/src/components/toolbar/bookmarkButton.js`
- `packages/app/src/bookmark/bookmarkState.js` or another focused helper near `packages/app/src/bookmark/`
- `packages/app/src/bookmark/bookmarkState.test.js` if the helper has non-trivial behavior

Tasks:

- Extract current bookmark assembly from `bookmarkButton.js` into a reusable helper.
- The helper should collect:
  - bookmarkable provenance actions
  - current zoomable scale domains
  - current view settings
  - optional plot attachments passed by the caller
- Update toolbar bookmark and share actions to use the helper with no plot attachments.
- Preserve existing `plots` when updating an existing bookmark from the toolbar by copying `existingBookmark?.plots` onto the new bookmark before saving.

Tests:

- Add or update focused tests for preserving existing `plots` during bookmark update if the toolbar is already testable.
- If toolbar tests are too heavy, cover the extracted helper and leave an explicit manual verification item for toolbar edit behavior.

### Commit 4: Add Plot Dialog Bookmark And Share Actions

Tentative commit message:

```text
feat(app): bookmark plots from the plot dialog
```

Files to inspect and likely modify:

- `packages/app/src/components/dialogs/enterBookmarkDialog.js`
- `packages/app/src/charts/plotDialog.js`
- `packages/app/src/charts/chartDialogUtils.js`
- `packages/app/src/components/dialogs/shareBookmarkDialog.js`
- `packages/app/src/bookmark/bookmark.js` or the helper from Commit 3
- `packages/app/src/bookmark/idbBookmarkDatabase.js`

Tasks:

- Add dialog-styled local bookmark and share-link buttons to the plot dialog.
- Use the current plot’s `request` to create one `BookmarkPlotAttachment`.
- Local bookmark action:
  - build the current-state bookmark with the plot attachment
  - open the existing title/notes dialog
  - save to `app.localBookmarkDatabase`
- Share action:
  - build the current-state bookmark with the plot attachment
  - open the existing title/notes dialog in share mode
  - show the existing share bookmark dialog
- Let the plot dialog open the existing title/notes bookmark flow directly, because toolbar access is blocked while the modal is open.
- Do not implement “add to existing bookmark” in the first version.
- Make URL hash sharing include the active plot because share links are generated from the bookmark containing the plot attachment.

Tests:

- Add focused component or helper tests for plot-dialog bookmark creation if practical.
- At minimum, test the bookmark-building helper with a plot attachment and the share-dialog path that serializes the bookmark.

### Commit 5: Rebuild Bookmark Plots On Restore

Tentative commit message:

```text
feat(app): rebuild plots attached to bookmarks
```

Files to inspect and likely modify:

- `packages/app/src/bookmark/bookmark.js`
- `packages/app/src/agentApi/index.js`
- `packages/app/src/bookmark/bookmark.test.js`
- `packages/app/src/agentApi/index.test.js`

Tasks:

- Add a small helper that rebuilds a `SampleAttributePlot` from a `BookmarkPlotAttachment`.
- Reuse `createAgentApi(app).buildSampleAttributePlot(...)` or extract the request-to-plot logic behind that API if direct reuse creates awkward dependencies.
- Restore normal bookmark state before rebuilding plot attachments, so plots use restored sample groups and view state.
- Return per-plot results that can represent either a rebuilt plot or an error message.
- Do not let plot rebuild failures abort bookmark state restore.

Tests:

- Bookmark entries with no `plots` still restore as before.
- Bookmark entries with plot attachments call the plot rebuild path after state restore.
- A failed plot rebuild is captured as a plot error result and does not prevent actions, view settings, or scale domains from restoring.

### Commit 6: Show Immediate Plot Previews In Bookmark Info Box

Tentative commit message:

```text
feat(app): show bookmark plot previews
```

Files to inspect and likely modify:

- `packages/app/src/components/dialogs/bookmarkInfoBox.js`
- `packages/app/src/charts/plotDialog.js`
- `packages/app/src/charts/chartDialogUtils.js`

Tasks:

- Show a “Plots” section when the restored bookmark has plot attachments.
- Render each rebuilt plot immediately as a compact preview with its title.
- Use existing chart embedding utilities for preview rendering.
- Provide “open larger” by passing the rebuilt plot to the existing plot dialog.
- Show plot-specific error messages inline if a plot cannot be rebuilt.
- Finalize embedded chart instances when the bookmark info box updates or closes.

Tests:

- Add focused tests for info-box rendering state if practical.
- Manually verify with the dev server:
  - create a plot
  - create a local bookmark from the plot dialog
  - load the bookmark
  - confirm the info box immediately shows the plot preview
  - create a share link from the plot dialog
  - open the share link and confirm the plot preview appears

### Commit 7: Final Verification And Polish

Tentative commit message:

```text
test(app): cover plot bookmark workflow
```

Tasks:

- Add any missing focused tests discovered during implementation.
- Run focused tests listed below.
- Run lint and TypeScript checks before opening a PR.
- Update this plan if implementation discovers a better file boundary.

## Proposed First Slice

Keep the first implementation narrow:

1. Add bookmark plot attachment types.
2. Preserve plot requests on generated sample attribute plots.
3. Add dialog-styled local bookmark and share-link actions to the plot dialog.
4. Include active plot attachments in share URL hashes created from the plot dialog.
5. Render attached plots immediately in the bookmark info box after restore.
6. Preserve attached plots when updating an existing bookmark.

Defer:

- Agent chat plot bookmarking.
- A full plot attachment editor.
- Multiple active plot surfaces.
- Sidebar or persistent plot gallery.

## Open UX Questions

- What exact labels should the plot dialog use for the local bookmark and share-link buttons?
- Should the plot preview size match the plot dialog aspect ratio or use a smaller fixed preview height?

## Verification

Run focused tests while developing:

```bash
npx vitest run packages/app/src/bookmark/bookmark.test.js
npx vitest run packages/app/src/charts/hierarchySampleAttributePlots.test.js
npx vitest run packages/app/src/agentApi/index.test.js
```

Before merging:

```bash
npm test
npm --workspaces run test:tsc --if-present
npm run lint
```
