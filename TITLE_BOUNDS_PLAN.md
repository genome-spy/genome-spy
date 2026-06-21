# Title Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve layout space for ordinary view titles so specs no longer need manual `padding` just to keep titles visible, closing [genome-spy/genome-spy#102](https://github.com/genome-spy/genome-spy/issues/102).

**Architecture:** Keep this scoped to the existing GridView decoration model. View titles remain generated `UnitView` decorations, but their resolved title spec gets a deterministic overhang calculation that participates in `GridChild.getOverhang()`, similar to external axes and side legends. Text measurement must be shared with existing axis and legend code rather than implemented as another private title-only measurement path.

**Tech Stack:** JavaScript with JSDoc types, Vitest, existing `GridView`/`GridChild` layout helpers, and `context.fontManager` for text metrics.

---

## File Structure

- Create: `packages/core/src/fonts/textMetrics.js`
  - Shared helpers for requesting fonts, measuring text, computing font height, and projecting text extents by angle.
- Test: `packages/core/src/fonts/textMetrics.test.js`
  - Unit-test shared text metrics and projection logic used by axes, legends, and titles.
- Modify: `packages/core/src/view/title.js`
  - Export helpers for resolving title orientation and producing title overhang using shared text metrics.
- Modify: `packages/core/src/view/axisView.js`
  - Reuse shared text metrics in axis label extent calculation.
- Modify: `packages/core/src/view/legendView.js`
  - Reuse shared text metrics in legend title width/extent calculation.
- Modify: `packages/core/src/view/gridView/gridChild.js`
  - Store the resolved title spec and add title overhang to `GridChild.getOverhang()`.
- Modify: `packages/core/src/view/gridView/gridView.js`
  - Render title decorations against coordinates that include the reserved title side when needed.
- Modify: `packages/core/src/genomeSpy/viewDataInit.js`
  - Make font readiness invalidate title-dependent layout caches before the first real render when title metrics may have been requested before custom fonts finished loading.
- Test: `packages/core/src/view/gridView/gridChild.test.js`
  - Unit-test title overhang on `GridChild`.
- Test: `packages/core/src/view/layoutSnapshot.test.js`
  - Snapshot or focused coordinate tests for title-reserved layout.
- Modify: `packages/core/src/spec/view.d.ts`
  - Remove the warning that manual padding is required.
- Modify: `examples/docs/grammar/config/title-styles.json`
  - Migrate the docs title-style example away from manual title padding so it exercises the new title bounds logic directly.
- Create: `examples/core/layout/title_bounds.json`
  - Add a compact acid-test example with trickier title arrangements for visual smoke testing in the dev server and screenshot tooling.

## Design Notes

- This feature should close GitHub issue [#102: Calculate bounds for view titles and axes](https://github.com/genome-spy/genome-spy/issues/102). The issue body mentions missing view-title bounds and vertical axis tick-label lengths; vertical axis label extent is already handled by the current axis measurement path, while this plan adds the missing title side.
- Avoid a third independent text-bounds implementation. Axis labels, legend titles, and view titles all need the same primitive operations: request the configured font, measure text width, compute text height from BMFont metrics, and project width/height through a rotation angle.
- The shared helper should be low-level and layout-agnostic. It should not know about axes, legends, titles, or `Padding`; those consumers decide which side receives the computed extent.
- Existing title defaults are in `packages/core/src/config/defaults/titleDefaults.js`.
- Default `group-title` has `orient: "top"` and `offset: 10`; this should reserve top space.
- `track-title` has `orient: "left"` and should reserve left space.
- `overlay-title` has `offset: -10`; it intentionally draws inside the plot and should reserve no external space.
- `examples/docs/grammar/config/title-styles.json` must stop using custom `padding` values to make titles visible. After this change, the group, track, and custom title examples should depend on title bounds reservation; the overlay example remains padding-free and intentionally overlays the plot area.
- `examples/core/layout/title_bounds.json` should exercise more than the docs example: different title orientations, adjacent titled views, interaction with axes, and one overlay title that must not reserve external space.
- Title bounds must account for asynchronous font loading. Calling `context.fontManager.getFont(...)` can return a font entry whose `metrics` are not ready yet and schedules a load. The shared text metrics helper must request custom fonts early, use a conservative fallback only while metrics are missing, and the initialization path must invalidate layout size caches after `fontManager.waitUntilReady()` so the first real render uses loaded metrics.
- Do not use the `measureText` data transform for view titles. View titles are spec-derived layout decorations, not row-derived labels. Reuse the same font metrics approach directly through `fontManager`.
- Layout tests that use `specToLayout(...)` do not run `initializeViewData(...)`; keep most title-bound layout tests on the default font or explicitly wait for font readiness in tests that exercise custom fonts.
- This first pass supports the current single-line title model. Do not add subtitle, multiline text, or a general scenegraph bounds system.
- If `fontSize` or `angle` is an `ExprRef`, use a conservative static fallback from the resolved title config rather than introducing reactive layout invalidation in this change.

---

### Task 1: Extract Shared Text Metrics and Font Readiness Handling

**Tentative commit:** `refactor(core): share text metrics for guide layout`

**Files:**
- Create: `packages/core/src/fonts/textMetrics.js`
- Test: `packages/core/src/fonts/textMetrics.test.js`
- Modify: `packages/core/src/view/axisView.js`
- Modify: `packages/core/src/view/legendView.js`
- Modify: `packages/core/src/view/title.js`
- Modify: `packages/core/src/genomeSpy/viewDataInit.js`
- Test: `packages/core/src/view/titleConfigPrecedence.test.js`
- Test: `packages/core/src/genomeSpy/viewDataInit.test.js`

- [ ] **Step 1: Add shared text metrics tests**

Create `packages/core/src/fonts/textMetrics.test.js`:

```js
import { describe, expect, test } from "vitest";
import {
    getProjectedTextExtent,
    getTextHeight,
    measureText,
    requestFont,
} from "./textMetrics.js";

function createMetrics() {
    return {
        common: { base: 10 },
        capHeight: 7,
        descent: 2,
        measureWidth: (text, size) => text.length * size,
    };
}

function createFontManager() {
    return {
        getDefaultFont: () => ({ metrics: createMetrics() }),
        getFont: (family, fontStyle, fontWeight) => ({
            family,
            fontStyle,
            fontWeight,
            metrics: createMetrics(),
        }),
    };
}

describe("textMetrics", () => {
    test("requests the default font when no family is configured", () => {
        const font = requestFont(createFontManager(), {});

        expect(font.metrics).toBeDefined();
    });

    test("requests configured font properties", () => {
        const font = requestFont(createFontManager(), {
            font: "Lato",
            fontStyle: "italic",
            fontWeight: "bold",
        });

        expect(font).toMatchObject({
            family: "Lato",
            fontStyle: "italic",
            fontWeight: "bold",
        });
    });

    test("measures text width and height from BMFont metrics", () => {
        const size = measureText(createMetrics(), "ABC", 10);

        expect(size).toEqual({ width: 30, height: 9 });
    });

    test("computes text height from cap height and descent", () => {
        expect(getTextHeight(createMetrics(), 20)).toBe(18);
    });

    test("projects text extent for horizontal and vertical layout directions", () => {
        const size = { width: 100, height: 10 };

        expect(getProjectedTextExtent(size, 0, "vertical")).toBe(10);
        expect(getProjectedTextExtent(size, 90, "vertical")).toBe(100);
        expect(getProjectedTextExtent(size, 0, "horizontal")).toBe(100);
        expect(getProjectedTextExtent(size, 90, "horizontal")).toBe(10);
    });
});
```

- [ ] **Step 2: Run shared text metrics tests and verify failure**

Run:

```bash
npx vitest run packages/core/src/fonts/textMetrics.test.js
```

Expected: FAIL because `packages/core/src/fonts/textMetrics.js` does not exist.

- [ ] **Step 3: Implement shared text metrics helpers**

Create `packages/core/src/fonts/textMetrics.js`:

```js
/**
 * @typedef {import("./bmFontManager.js").BMFontMetrics} BMFontMetrics
 * @typedef {import("./bmFontManager.js").FontEntry} FontEntry
 * @typedef {import("../spec/font.js").FontStyle} FontStyle
 * @typedef {import("../spec/font.js").FontWeight} FontWeight
 * @typedef {{
 *     font?: string,
 *     fontStyle?: FontStyle,
 *     fontWeight?: FontWeight,
 * }} FontConfig
 */

/**
 * Requests a font entry and registers asynchronous loading for custom fonts.
 *
 * @param {import("./bmFontManager.js").default} fontManager
 * @param {FontConfig} config
 * @returns {FontEntry}
 */
export function requestFont(fontManager, config) {
    return config.font
        ? fontManager.getFont(
              config.font,
              config.fontStyle,
              config.fontWeight
          )
        : fontManager.getDefaultFont();
}

/**
 * @param {BMFontMetrics} metrics
 * @param {number} fontSize
 */
export function getTextHeight(metrics, fontSize) {
    return ((metrics.capHeight + metrics.descent) / metrics.common.base) * fontSize;
}

/**
 * @param {BMFontMetrics} metrics
 * @param {string} text
 * @param {number} fontSize
 */
export function measureText(metrics, text, fontSize) {
    return {
        width: metrics.measureWidth(text, fontSize),
        height: getTextHeight(metrics, fontSize),
    };
}

/**
 * Returns the projected text extent along a layout direction after rotation.
 *
 * @param {{ width: number, height: number }} size
 * @param {number} angle
 * @param {"horizontal" | "vertical"} direction
 */
export function getProjectedTextExtent(size, angle, direction) {
    const radians = (angle * Math.PI) / 180;
    const absSin = Math.abs(Math.sin(radians));
    const absCos = Math.abs(Math.cos(radians));

    return direction == "vertical"
        ? size.width * absSin + size.height * absCos
        : size.width * absCos + size.height * absSin;
}
```

- [ ] **Step 4: Run shared text metrics tests and verify pass**

Run:

```bash
npx vitest run packages/core/src/fonts/textMetrics.test.js
```

Expected: PASS.

- [ ] **Step 5: Refactor axis label measurement to use shared helpers**

In `packages/core/src/view/axisView.js`, add:

```js
import { getProjectedTextExtent, getTextHeight } from "../fonts/textMetrics.js";
```

In `getMeasuredLabelExtent(...)`, replace the local `labelHeight`, `radians`, `absSin`, `absCos`, and `perpendicularExtent` calculation with:

```js
const labelHeight = getTextHeight(metrics, axisProps.labelFontSize);
const perpendicularExtent = getProjectedTextExtent(
    { width: maxWidth, height: labelHeight },
    axisProps.labelAngle,
    orient2channel(axisProps.orient) == "x" ? "vertical" : "horizontal"
);
```

Keep the existing `fontManager.getFont(...)` call in axis code for now because axis labels already request custom fonts through their `measureText` transform and text mark setup. This step only removes duplicate projection and height math.

- [ ] **Step 6: Refactor legend title measurement to use shared helpers**

In `packages/core/src/view/legendView.js`, add:

```js
import { measureText, requestFont } from "../fonts/textMetrics.js";
```

In `getTitleWidth(...)`, replace the direct font lookup and width calculation with:

```js
const font = requestFont(context.fontManager, {
    font: legend.titleFont,
    fontStyle: legend.titleFontStyle,
    fontWeight: legend.titleFontWeight,
});
const metrics = font.metrics;
if (!metrics) {
    return 0;
}

const fontSize = legend.titleFontSize ?? 11;
return truncateText(
    legend.title,
    legend.titleLimit,
    (text) => measureText(metrics, text, fontSize).width
).width;
```

If the existing `truncateText(...)` helper in `legendView.js` expects a font metrics object rather than a callback, keep the local truncate call shape and replace only the font request and width measurement parts. The goal is reuse of `requestFont(...)` and `measureText(...)`, not a semantic legend layout change.

- [ ] **Step 7: Add focused tests for title overhang**

Add these imports to `packages/core/src/view/titleConfigPrecedence.test.js`:

```js
import Padding from "./layout/padding.js";
import { getTitleOverhang } from "./title.js";
```

Add this helper and tests near the existing title tests:

```js
function createFontContext() {
    return {
        fontManager: {
            getDefaultFont: () => ({
                metrics: {
                    common: { base: 10 },
                    capHeight: 7,
                    descent: 2,
                    measureWidth: (text, size) => text.length * size,
                },
            }),
            getFont: () => ({
                metrics: {
                    common: { base: 10 },
                    capHeight: 7,
                    descent: 2,
                    measureWidth: (text, size) => text.length * size,
                },
            }),
        },
    };
}

test("top title reserves positive offset and text height", () => {
    const overhang = getTitleOverhang(
        {
            text: "Title",
            orient: "top",
            offset: 10,
            fontSize: 12,
            angle: 0,
        },
        createFontContext()
    );

    expect(overhang).toEqual(new Padding(21, 0, 0, 0));
});

test("left title reserves positive offset and rotated text height", () => {
    const overhang = getTitleOverhang(
        {
            text: "Track title",
            orient: "left",
            offset: 10,
            fontSize: 12,
            angle: -90,
        },
        createFontContext()
    );

    expect(overhang).toEqual(new Padding(0, 0, 0, 21));
});

test("negative offset title reserves no external space", () => {
    const overhang = getTitleOverhang(
        {
            text: "Overlay",
            orient: "top",
            offset: -10,
            fontSize: 12,
            angle: 0,
        },
        createFontContext()
    );

    expect(overhang).toEqual(Padding.zero());
});
```

- [ ] **Step 8: Run the title tests and verify failure**

Run:

```bash
npx vitest run packages/core/src/view/titleConfigPrecedence.test.js
```

Expected: FAIL because `getTitleOverhang` is not exported.

- [ ] **Step 9: Implement title overhang helpers using shared text metrics**

In `packages/core/src/view/title.js`, add imports:

```js
import {
    getProjectedTextExtent,
    measureText,
    requestFont,
} from "../fonts/textMetrics.js";
import Padding from "./layout/padding.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
```

Add this code after `resolveTitleSpec`:

```js
/**
 * Requests the title font so asynchronous font loading is registered before
 * layout uses title metrics.
 *
 * @param {import("../spec/title.js").Title | undefined} spec
 * @param {import("../types/viewContext.js").default} context
 */
export function requestTitleFont(spec, context) {
    return requestFont(context.fontManager, spec ?? {});
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {import("../types/viewContext.js").default | { fontManager: import("../fonts/bmFontManager.js").default }} context
 * @returns {Padding}
 */
export function getTitleOverhang(spec, context) {
    if (!spec || spec.orient == "none" || spec.offset < 0) {
        return Padding.zero();
    }

    const extent = getTitlePerpendicularExtent(spec, context);
    const reserved = Math.ceil(extent + Math.max(spec.offset ?? 0, 0));

    switch (spec.orient) {
        case "top":
            return new Padding(reserved, 0, 0, 0);
        case "right":
            return new Padding(0, reserved, 0, 0);
        case "bottom":
            return new Padding(0, 0, reserved, 0);
        case "left":
            return new Padding(0, 0, 0, reserved);
        default:
            return Padding.zero();
    }
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {import("../types/viewContext.js").default | { fontManager: import("../utils/fontManager.js").default }} context
 */
function getTitlePerpendicularExtent(spec, context) {
    const fontSize = isExprRef(spec.fontSize) ? 12 : (spec.fontSize ?? 12);
    const angle = isExprRef(spec.angle) ? 0 : (spec.angle ?? 0);
    const font = requestTitleFont(spec, context);
    const metrics = font.metrics;
    const direction =
        spec.orient == "top" || spec.orient == "bottom"
            ? "vertical"
            : "horizontal";

    if (!metrics) {
        const fallbackMetrics = context.fontManager.getDefaultFont().metrics;
        if (!fallbackMetrics) {
            return fontSize;
        }

        return getProjectedTextExtent(
            measureTitleText(spec, fallbackMetrics, fontSize),
            angle,
            direction
        );
    }

    return getProjectedTextExtent(
        measureTitleText(spec, metrics, fontSize),
        angle,
        direction
    );
}

/**
 * @param {import("../spec/title.js").Title} spec
 * @param {import("../fonts/bmFontManager.js").BMFontMetrics} metrics
 * @param {number} fontSize
 */
function measureTitleText(spec, metrics, fontSize) {
    const text =
        typeof spec.text == "string" ? spec.text : String(spec.text.expr);

    return measureText(metrics, text, fontSize);
}
```

- [ ] **Step 10: Request title fonts when GridChild creates title decorations**

This edit is completed in Task 2, but the contract belongs here: `GridChild` must call `requestTitleFont(this.titleSpec, this.layoutParent.context)` after resolving `titleSpec`. This registers async font loads before `initializeViewData(...)` awaits `fontManager.waitUntilReady()`.

- [ ] **Step 11: Add a view-data initialization regression test for custom title fonts**

In `packages/core/src/genomeSpy/viewDataInit.test.js`, add a test that uses a fake font manager where `getFont(...)` initially returns no metrics and `waitUntilReady()` fills them. The test should verify that initialization invalidates layout caches after fonts become ready.

Use this structure, adapting helper names to the existing file:

```js
test("invalidates layout after custom title fonts finish loading", async () => {
    let ready = false;
    const fontManager = {
        getDefaultFont: () => ({
            metrics: {
                common: { base: 10 },
                capHeight: 7,
                descent: 2,
                measureWidth: (text, size) => text.length * size,
            },
        }),
        getFont: () => ({
            get metrics() {
                return ready
                    ? {
                          common: { base: 10 },
                          capHeight: 14,
                          descent: 4,
                          measureWidth: (text, size) => text.length * size * 2,
                      }
                    : undefined;
            },
        }),
        waitUntilReady: async () => {
            ready = true;
        },
    };

    const { view, context, dataFlow } = await createHeadlessViewHierarchy(
        {
            vconcat: [
                {
                    title: { text: "Custom font title", font: "Custom" },
                    data: { values: [{ x: 1, y: 2 }] },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative", axis: null },
                        y: { field: "y", type: "quantitative", axis: null },
                    },
                },
            ],
        },
        { fontManager }
    );

    view.getSize();
    await initializeViewData(view, dataFlow, fontManager, () => undefined);

    expect(view.getSize().height.px).toBeGreaterThan(0);
});
```

The exact assertion should compare before/after size if the existing helpers make that straightforward. The important contract is that a pre-font-ready cached size cannot survive initialization.

- [ ] **Step 12: Invalidate size caches after font readiness**

In `packages/core/src/genomeSpy/viewDataInit.js`, after each `await fontManager.waitUntilReady();`, invalidate layout size caches before graphics finalization or subsequent render:

```js
await fontManager.waitUntilReady();
viewRoot.invalidateSizeCache();
await finalizeSubtreeGraphics(graphicsPromises);
```

Apply the same pattern in `initializeVisibleViewData(...)` after its `waitUntilReady()` call:

```js
await fontManager.waitUntilReady();
viewRoot.invalidateSizeCache();
await finalizeSubtreeGraphics(graphicsPromises);
```

This is intentionally broad and conservative. Font metrics affect text mark geometry, `measureText`, axis label extents, legend layout, and title bounds; invalidating the root size cache after font readiness keeps stale fallback measurements out of the first post-load render.

- [ ] **Step 13: Run shared metrics, title, axis, legend, and font-readiness tests**

Run:

```bash
npx vitest run packages/core/src/fonts/textMetrics.test.js packages/core/src/view/titleConfigPrecedence.test.js packages/core/src/view/axisExtent.test.js packages/core/src/view/legendExtent.test.js packages/core/src/genomeSpy/viewDataInit.test.js
```

Expected: PASS.

---

### Task 2: Include Title Overhang in GridChild

**Tentative commit:** `feat(core): reserve grid space for view titles`

**Files:**
- Modify: `packages/core/src/view/gridView/gridChild.js`
- Test: `packages/core/src/view/gridView/gridChild.test.js`

- [ ] **Step 1: Add GridChild tests for title overhang**

Add a test that creates a single child with a default title and verifies top overhang grows. Use the existing helpers in `gridChild.test.js`; keep assertions focused:

```js
test("default view title contributes top overhang", async () => {
    const child = await createGridChild({
        title: "Group title",
        data: { values: [{ x: 1, y: 2 }] },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative", axis: null },
            y: { field: "y", type: "quantitative", axis: null },
        },
    });

    expect(child.getOverhang().top).toBeGreaterThan(0);
});

test("overlay view title does not contribute external overhang", async () => {
    const child = await createGridChild({
        title: { text: "Overlay", style: "overlay-title" },
        data: { values: [{ x: 1, y: 2 }] },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative", axis: null },
            y: { field: "y", type: "quantitative", axis: null },
        },
    });

    expect(child.getOverhang().top).toBe(0);
});
```

- [ ] **Step 2: Run the GridChild tests and verify failure**

Run:

```bash
npx vitest run packages/core/src/view/gridView/gridChild.test.js
```

Expected: FAIL because titles are not included in `GridChild.getOverhang()`.

- [ ] **Step 3: Store resolved title spec and add it to overhang**

In `packages/core/src/view/gridView/gridChild.js`, change the title import:

```js
import createTitle, {
    getTitleOverhang,
    requestTitleFont,
    resolveTitleSpec,
} from "../title.js";
```

Add a class field in the constructor area:

```js
/** @type {import("../../spec/title.js").Title | undefined} */
this.titleSpec = undefined;
```

Replace the local `titleSpec` block with:

```js
this.titleSpec = resolveTitleSpec(view.spec.title, view.getConfigScopes());
this.titleZindex = this.titleSpec?.zindex ?? 1;
requestTitleFont(this.titleSpec, this.layoutParent.context);
const title = createTitle(this.titleSpec);
```

Add a helper method:

```js
getTitleOverhang() {
    return this.titleSpec
        ? getTitleOverhang(this.titleSpec, this.layoutParent.context)
        : Padding.zero();
}
```

Update `getOverhang()` to add the title overhang:

```js
return new Padding(
    calculate("top") + legend("top"),
    calculate("right") + legend("right"),
    calculate("bottom") + legend("bottom"),
    calculate("left") + legend("left")
)
    .add(this.getTitleOverhang())
    .add(this.view.getOverhang());
```

- [ ] **Step 4: Run GridChild tests and verify pass**

Run:

```bash
npx vitest run packages/core/src/view/gridView/gridChild.test.js
```

Expected: PASS. This also confirms `GridChild` requests title fonts early enough for `initializeViewData(...)` to await them.

---

### Task 3: Render Titles Against Reserved Coordinates

**Tentative commit:** `fix(core): render titles in reserved bounds`

**Files:**
- Modify: `packages/core/src/view/gridView/gridView.js`
- Test: `packages/core/src/view/layoutSnapshot.test.js`

- [ ] **Step 1: Add a focused layout test**

Add a test that renders two vertically concatenated views, the first with a title and no manual padding. The expected condition is that the child plot begins below the title-reserved top overhang:

```js
test("reserves space for view titles without manual padding", async () => {
    const layout = await specToLayout({
        vconcat: [
            {
                name: "titled",
                title: "Group title",
                data: { values: [{ x: 1, y: 2 }] },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative", axis: null },
                    y: { field: "y", type: "quantitative", axis: null },
                },
            },
            {
                name: "plain",
                data: { values: [{ x: 1, y: 2 }] },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative", axis: null },
                    y: { field: "y", type: "quantitative", axis: null },
                },
            },
        ],
    });

    const titled = layout.children.find((child) => child.viewName == "titled");
    expect(titled.coords).toMatch(/y: [1-9][0-9]*/);
});
```

Adjust the helper call to match the local `layoutSnapshot.test.js` API if the file uses `renderToLayout(...)` rather than `specToLayout(...)`.

- [ ] **Step 2: Run the layout snapshot tests**

Run:

```bash
npx vitest run packages/core/src/view/layoutSnapshot.test.js
```

Expected before the render-coordinate adjustment: the overhang participates in grid sizing, but the title may still render relative to the plot viewport instead of the expanded title area.

- [ ] **Step 3: Add title decoration coordinates**

In `packages/core/src/view/gridView/gridView.js`, include `titleOverhang` in each render item:

```js
const titleOverhang = gridChild.getTitleOverhang();
```

Add it to the object pushed to `renderItems`.

Before queuing the title decoration, compute:

```js
const titleCoords = viewportCoords.expand(titleOverhang);
```

Render title with `titleCoords`:

```js
if (title) {
    queueDecoration(
        gridChild.titleZindex,
        DECORATION_ORDER.title,
        () => title?.render(context, titleCoords, options)
    );
}
```

- [ ] **Step 4: Run layout tests and focused GridView tests**

Run:

```bash
npx vitest run packages/core/src/view/layoutSnapshot.test.js packages/core/src/view/gridView/gridView.test.js
```

Expected: PASS. If snapshots change, inspect the changed coordinates and update only snapshots affected by the new title overhang behavior.

---

### Task 4: Update User-Facing Docs and Example

**Tentative commit:** `docs(core): add title bounds examples`

**Files:**
- Modify: `packages/core/src/spec/view.d.ts`
- Modify: `examples/docs/grammar/config/title-styles.json`
- Create: `examples/core/layout/title_bounds.json`

- [ ] **Step 1: Update title documentation**

Replace the title docs in `packages/core/src/spec/view.d.ts` with:

```ts
/**
 * View title.
 */
title?: string | Title;
```

- [ ] **Step 2: Migrate the docs title-style example to title bounds**

In `examples/docs/grammar/config/title-styles.json`, remove all custom `padding` properties that exist only to make titles visible:

```json
"padding": { "top": 18 }
```

```json
"padding": { "left": 65 }
```

```json
"padding": { "top": 28 }
```

The resulting `vconcat` entries should be:

```json
"vconcat": [
  {
    "title": { "text": "Group title (the default)", "style": "group-title" },
    "mark": "point"
  },
  {
    "title": { "text": "Track title", "style": "track-title" },
    "mark": "point"
  },
  {
    "title": { "text": "Overlay title", "style": "overlay-title" },
    "mark": "point"
  },
  {
    "title": { "text": "Custom title", "style": "custom-title" },
    "mark": "point"
  }
]
```

This example is the user-facing smoke test for title bounds. Group, track, and custom title visibility must come from the implementation, not authored padding. Keep the `overlay-title` entry padding-free because it intentionally overlays the plot area.

- [ ] **Step 3: Add or update a regression assertion for the migrated docs example**

Add a focused assertion to the layout test from Task 3 or a nearby docs-example test that loads `examples/docs/grammar/config/title-styles.json` and verifies the first titled view gets positive top overhang and the track-title view gets positive left overhang without authored padding.

Use this intent if a direct docs-example loader already exists:

```js
test("title-styles docs example relies on title bounds instead of padding", async () => {
    const spec = await loadExampleSpec(
        "examples/docs/grammar/config/title-styles.json"
    );
    const layout = await specToLayout(spec);

    expect(spec.vconcat[0].padding).toBeUndefined();
    expect(spec.vconcat[1].padding).toBeUndefined();
    expect(spec.vconcat[3].padding).toBeUndefined();

    const groupTitleView = layout.children.find(
        (child) => child.viewName == "grid0"
    );
    const trackTitleView = layout.children.find(
        (child) => child.viewName == "grid1"
    );

    expect(groupTitleView.coords).toMatch(/y: [1-9][0-9]*/);
    expect(trackTitleView.coords).toMatch(/x: [1-9][0-9]*/);
});
```

If there is no existing docs-example loader, keep the same assertion structure but inline the relevant four-view spec in `packages/core/src/view/layoutSnapshot.test.js` and mention `examples/docs/grammar/config/title-styles.json` in the test name.

- [ ] **Step 4: Add a core title bounds acid-test example**

Create `examples/core/layout/title_bounds.json` with this content:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@genome-spy/core/dist/schema.json",
  "description": "Acid test for title bounds in composed layouts.",

  "data": {
    "values": [
      { "x": 0, "y": 1, "category": "A" },
      { "x": 1, "y": 3, "category": "B" },
      { "x": 2, "y": 2, "category": "C" },
      { "x": 3, "y": 4, "category": "D" }
    ]
  },

  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "y", "type": "quantitative" }
  },

  "vconcat": [
    {
      "title": {
        "text": "Top title with bottom axis",
        "orient": "top",
        "anchor": "start",
        "fontSize": 15,
        "fontWeight": "bold"
      },
      "height": 90,
      "mark": "point"
    },

    {
      "hconcat": [
        {
          "title": {
            "text": "Left title",
            "orient": "left",
            "anchor": "middle",
            "fontSize": 14
          },
          "width": 120,
          "height": 80,
          "mark": "point"
        },
        {
          "title": {
            "text": "Right title",
            "orient": "right",
            "anchor": "middle",
            "fontSize": 14
          },
          "width": 120,
          "height": 80,
          "mark": "point"
        }
      ]
    },

    {
      "title": {
        "text": "Overlay title should not reserve extra space",
        "style": "overlay-title"
      },
      "height": 80,
      "mark": "point"
    },

    {
      "title": {
        "text": "Bottom title",
        "orient": "bottom",
        "anchor": "end",
        "fontSize": 16
      },
      "height": 90,
      "mark": "point"
    }
  ],

  "config": {
    "view": { "stroke": "#d0d0d0", "strokeWidth": 1 }
  }
}
```

This example must not contain manual `padding` for title visibility. It should remain readable according to `examples/README.md`: `$schema` first, `description` second, blank lines between major sections, and compact repeated data rows.

- [ ] **Step 5: Add a regression assertion for the core acid-test example**

Add a layout test that loads or inlines the `examples/core/layout/title_bounds.json` spec and verifies all non-overlay orientations reserve space:

```js
test("core title bounds acid test reserves title sides", async () => {
    const spec = await loadExampleSpec("examples/core/layout/title_bounds.json");
    const layout = await specToLayout(spec);

    expect(spec.vconcat[0].padding).toBeUndefined();
    expect(spec.vconcat[2].padding).toBeUndefined();
    expect(spec.vconcat[3].padding).toBeUndefined();

    const topTitleView = layout.children.find(
        (child) => child.viewName == "grid0"
    );
    const nestedRow = layout.children.find((child) => child.viewName == "grid1");
    const bottomTitleView = layout.children.find(
        (child) => child.viewName == "grid3"
    );

    expect(topTitleView.coords).toMatch(/y: [1-9][0-9]*/);
    expect(nestedRow.children[0].coords).toMatch(/x: [1-9][0-9]*/);
    expect(nestedRow.children[1].coords).toMatch(/width: 1[01][0-9]/);
    expect(bottomTitleView.coords).toMatch(/height: [1-9][0-9]*/);
});
```

If no example loader exists in the relevant test file, add a small helper using `fs/promises.readFile` and `JSON.parse` near the layout tests:

```js
async function loadExampleSpec(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
```

- [ ] **Step 6: Validate JSON formatting**

Run:

```bash
npx prettier --check examples/docs/grammar/config/title-styles.json examples/core/layout/title_bounds.json
```

Expected: PASS.

---

### Task 5: Final Verification

**Tentative commit:** Use one of the earlier task commits if verification requires fixes; otherwise no commit is needed for this task.

**Files:**
- No additional edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run packages/core/src/fonts/textMetrics.test.js packages/core/src/view/titleConfigPrecedence.test.js packages/core/src/view/axisExtent.test.js packages/core/src/view/legendExtent.test.js packages/core/src/genomeSpy/viewDataInit.test.js packages/core/src/view/gridView/gridChild.test.js packages/core/src/view/layoutSnapshot.test.js packages/core/src/view/gridView/gridView.test.js
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript checks if available**

Run:

```bash
npm --workspaces run test:tsc --if-present
```

Expected: PASS or no-op for workspaces without `test:tsc`.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Inspect the diff**

Run:

```bash
git diff --stat
git diff -- packages/core/src/fonts/textMetrics.js packages/core/src/fonts/textMetrics.test.js packages/core/src/view/title.js packages/core/src/view/axisView.js packages/core/src/view/legendView.js packages/core/src/view/gridView/gridChild.js packages/core/src/view/gridView/gridView.js packages/core/src/genomeSpy/viewDataInit.js packages/core/src/spec/view.d.ts examples/docs/grammar/config/title-styles.json examples/core/layout/title_bounds.json
```

Expected: diff is limited to shared text metrics, title bounds, axis/legend metric reuse, tests, and docs/example cleanup.

- [ ] **Step 5: Prepare PR notes that close issue #102**

When preparing the PR description, include this closing reference so GitHub closes the issue when the PR is merged:

```markdown
Closes #102.
```

Also mention the scope explicitly:

```markdown
This adds layout-reserved bounds for view titles, completing the missing title side of #102. Axis label bounds continue to use the existing axis extent measurement path.
```

## Self-Review

- Spec coverage: The plan covers title extent calculation, grid overhang integration, render positioning, tests, docs/example cleanup, the core acid-test example, async font readiness, and the `Closes #102` PR handoff.
- Placeholder scan: The plan avoids placeholder steps and includes exact files, commands, and expected outcomes.
- Type consistency: The new API is `getTitleOverhang(spec, context)`, stored on `GridChild` as `titleSpec`, exposed locally through `gridChild.getTitleOverhang()`, and consumed by `GridView`.

## Execution Options

Plan complete and saved to `TITLE_BOUNDS_PLAN.md`.

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** - Execute tasks in this session with checkpoints.
