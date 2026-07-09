# Tooltip Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `encoding.tooltip` channel so specs can choose which datum fields appear in the default tooltip, then use it in the BAM read-alignments example to omit large `seq` and `qual` fields from `read-backbone`.

**Architecture:** Keep `mark.tooltip` as the tooltip handler selector/disable switch. Add `encoding.tooltip` as a metadata channel that is parsed with the rest of the encoding but skipped by GPU mark-property encoders. Resolve configured tooltip rows in the tooltip context and let the default tooltip handler render those rows instead of the flattened datum when the channel is present.

**Tech Stack:** JavaScript with JSDoc, TypeScript `.d.ts` spec definitions, Vitest with jsdom for tooltip rendering tests, JSON schema/docs generation from spec types.

---

## File Map

- Modify `packages/core/src/spec/channel.d.ts`
  - Add `tooltip` to `ChannelWithoutScale`.
  - Add `TooltipDef` and `Encoding.tooltip`.
  - Document user-facing behavior and defaults.
- Modify `packages/core/src/marks/mark.js`
  - Add `tooltip` to base supported channels so all marks preserve explicit tooltip encodings.
- Modify `packages/core/src/encoder/encoder.js`
  - Treat `tooltip` as a non-mark-property metadata channel.
- Create `packages/core/src/tooltip/configuredTooltipRows.js`
  - Convert `encoding.tooltip` definitions into ordered tooltip rows.
  - Preserve the source field separately from the rendered row key for color legend lookup.
- Create `packages/core/src/tooltip/configuredTooltipRows.test.js`
  - Unit-test row selection, order, titles, formatting, expressions, constants, nested fields, and `null`.
- Modify `packages/core/src/tooltip/tooltipHandler.ts`
  - Add `sourceField?: string` and `formatted?: boolean` to `TooltipRow`.
  - Add `tooltipRows?: TooltipRow[]` to `TooltipContext`.
- Modify `packages/core/src/tooltip/tooltipContext.js`
  - Add configured tooltip rows to the context.
- Modify `packages/core/src/tooltip/tooltipContext.test.js`
  - Verify `createTooltipContext()` exposes configured rows.
- Modify `packages/core/src/tooltip/dataTooltipHandler.js`
  - Prefer `context.tooltipRows` when present.
  - Keep current all-fields behavior when `encoding.tooltip` is omitted.
  - Continue prepending genomic rows.
- Modify `packages/core/src/tooltip/dataTooltipHandler.test.js`
  - Verify default handler renders only configured rows when available and preserves color legend behavior with custom titles.
- Modify `docs/api/embed-options.md`
  - Document the difference between `mark.tooltip` handlers and `encoding.tooltip` field selection.
- Modify `docs/grammar/mark/index.md`
  - Add a short tooltip-channel section near encoding channel docs.
- Modify `examples/docs/genomic-data/examples/bam-read-alignments.json`
  - Add `encoding.tooltip` to the `read-backbone` layer and intentionally omit `seq` and `qual`.
- Regenerate generated schema/docs artifacts after spec changes:
  - `docs/schema.json`
  - `docs/app-schema.json`
  - any generated docs/examples touched by the build.

---

### Task 1: Add Spec Types for `encoding.tooltip`

**Files:**
- Modify: `packages/core/src/spec/channel.d.ts`

- [ ] **Step 1: Add the channel and type definitions**

Edit `packages/core/src/spec/channel.d.ts` so `ChannelWithoutScale` includes `tooltip` and define a tooltip channel type near `TextDef`:

```ts
export type ChannelWithoutScale =
    | "uniqueId"
    | "search"
    | "text"
    | "tooltip"
    | "key"
    | "facetIndex"
    | "semanticScore"
    | "uniqueId"
    | "sample";

export type TooltipDef = TextDef | TextDef[] | null;
```

- [ ] **Step 2: Add `Encoding.tooltip` documentation**

Add this property to `Encoding` after `text?: TextDef;`:

```ts
    /**
     * Fields or values shown by the default tooltip handler.
     *
     * If omitted, the default tooltip handler shows the hovered datum's
     * properties. If `null`, the default tooltip handler shows no raw datum
     * rows for this mark. Use an array to show multiple rows in a specific
     * order.
     */
    tooltip?: TooltipDef;
```

- [ ] **Step 3: Run a focused type/schema check**

Run:

```bash
npm --workspaces run test:tsc --if-present
```

Expected: PASS, or the same unrelated pre-existing workspace failures if the tree already has them. If TypeScript reports that `TooltipDef` includes an array where `ChannelDef` does not expect one, update `ChannelDef` to exclude `TextDef[]` in the same way it currently excludes `FieldDefWithoutScale[]`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/spec/channel.d.ts
git commit -m "feat(core): add tooltip encoding type"
```

---

### Task 2: Preserve Tooltip Encoding as Metadata

**Files:**
- Modify: `packages/core/src/marks/mark.js`
- Modify: `packages/core/src/encoder/encoder.js`
- Test: `packages/core/src/encoder/encoder.test.js`

- [ ] **Step 1: Add a failing metadata-channel test**

In `packages/core/src/encoder/encoder.test.js`, extend the `isNonMarkPropertyChannel` test:

```js
describe("isNonMarkPropertyChannel", () => {
    it("identifies metadata channels", () => {
        expect(isNonMarkPropertyChannel("key")).toBe(true);
        expect(isNonMarkPropertyChannel("search")).toBe(true);
        expect(isNonMarkPropertyChannel("tooltip")).toBe(true);
        expect(isNonMarkPropertyChannel("x")).toBe(false);
    });
});
```

Run:

```bash
npx vitest run packages/core/src/encoder/encoder.test.js
```

Expected: FAIL because `tooltip` is not yet classified as a metadata channel.

- [ ] **Step 2: Add `tooltip` to supported channels**

In `packages/core/src/marks/mark.js`, update `getSupportedChannels()`:

```js
    getSupportedChannels() {
        return [
            "sample",
            "facetIndex",
            "x",
            "y",
            "color",
            "opacity",
            "search",
            "tooltip",
            "uniqueId",
        ];
    }
```

- [ ] **Step 3: Skip `tooltip` in visual encoder construction**

In `packages/core/src/encoder/encoder.js`, update `isNonMarkPropertyChannel()`:

```js
export function isNonMarkPropertyChannel(channel) {
    return channel === "key" || channel === "search" || channel === "tooltip";
}
```

- [ ] **Step 4: Run the focused encoder test**

Run:

```bash
npx vitest run packages/core/src/encoder/encoder.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/marks/mark.js packages/core/src/encoder/encoder.js packages/core/src/encoder/encoder.test.js
git commit -m "feat(core): preserve tooltip as metadata encoding"
```

---

### Task 3: Resolve Configured Tooltip Rows

**Files:**
- Create: `packages/core/src/tooltip/configuredTooltipRows.js`
- Create: `packages/core/src/tooltip/configuredTooltipRows.test.js`

- [ ] **Step 1: Write failing row-resolution tests**

Create `packages/core/src/tooltip/configuredTooltipRows.test.js`:

```js
import { expect, test } from "vitest";
import { getConfiguredTooltipRows } from "./configuredTooltipRows.js";

function makeMark(tooltip) {
    return {
        encoding: {
            tooltip,
        },
        unitView: {
            paramRuntime: {
                createExpression: (expr) => new Function("datum", `return ${expr};`),
            },
        },
    };
}

test("returns undefined when tooltip channel is omitted", () => {
    const mark = makeMark(undefined);
    expect(getConfiguredTooltipRows({ sample: "S1" }, mark)).toBeUndefined();
});

test("returns an empty row set when tooltip channel is null", () => {
    const mark = makeMark(null);
    expect(getConfiguredTooltipRows({ sample: "S1" }, mark)).toEqual([]);
});

test("returns configured field rows in order", () => {
    const mark = makeMark([
        { field: "sample", title: "Sample" },
        { field: "score", title: "Score", format: ".2f" },
    ]);

    expect(getConfiguredTooltipRows({ sample: "S1", score: 1.234 }, mark)).toEqual([
        { key: "Sample", value: "S1", sourceField: "sample" },
        { key: "Score", value: "1.23", sourceField: "score", formatted: true },
    ]);
});

test("supports nested fields and expressions", () => {
    const mark = makeMark([
        { field: "read.name", title: "Read" },
        { expr: "datum.start + '-' + datum.end", title: "Span" },
    ]);

    expect(
        getConfiguredTooltipRows(
            { read: { name: "r1" }, start: 10, end: 20 },
            mark
        )
    ).toEqual([
        { key: "Read", value: "r1", sourceField: "read.name" },
        { key: "Span", value: "10-20" },
    ]);
});

test("rejects an empty tooltip array", () => {
    expect(() => getConfiguredTooltipRows({}, makeMark([]))).toThrow(
        "The tooltip channel array must not be empty."
    );
});
```

Run:

```bash
npx vitest run packages/core/src/tooltip/configuredTooltipRows.test.js
```

Expected: FAIL because `configuredTooltipRows.js` does not exist.

- [ ] **Step 2: Implement row resolution**

Create `packages/core/src/tooltip/configuredTooltipRows.js`:

```js
import { format as d3format } from "d3-format";
import { field } from "../utils/field.js";

/**
 * @typedef {import("./tooltipHandler.js").TooltipRow} TooltipRow
 */

const accessorCache = new WeakMap();

/**
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @returns {TooltipRow[] | undefined}
 */
export function getConfiguredTooltipRows(datum, mark) {
    const tooltipDef = mark.encoding.tooltip;
    if (tooltipDef === undefined) {
        return undefined;
    } else if (tooltipDef === null) {
        return [];
    }

    const definitions = Array.isArray(tooltipDef)
        ? tooltipDef
        : [tooltipDef];

    if (definitions.length === 0) {
        throw new Error("The tooltip channel array must not be empty.");
    }

    return definitions.map((definition) =>
        resolveTooltipRow(datum, mark, definition)
    );
}

/**
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../spec/channel.js").TextDef} definition
 * @returns {TooltipRow}
 */
function resolveTooltipRow(datum, mark, definition) {
    const accessor = getTooltipAccessor(mark, definition);
    const rawValue = accessor(datum);
    const formattedValue =
        "format" in definition && definition.format
            ? d3format(definition.format)(rawValue)
            : rawValue;

    return {
        key: getTooltipTitle(definition),
        value: formattedValue,
        ...(accessor.sourceField ? { sourceField: accessor.sourceField } : {}),
        ...(formattedValue !== rawValue ? { formatted: true } : {}),
    };
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../spec/channel.js").TextDef} definition
 * @returns {((datum: Record<string, any>) => any) & { sourceField?: string }}
 */
function getTooltipAccessor(mark, definition) {
    let cache = accessorCache.get(mark);
    if (!cache) {
        cache = new WeakMap();
        accessorCache.set(mark, cache);
    }

    const cached = cache.get(definition);
    if (cached) {
        return cached;
    }

    /** @type {((datum: Record<string, any>) => any) & { sourceField?: string }} */
    let accessor;
    if ("field" in definition) {
        accessor = field(definition.field);
        accessor.sourceField = definition.field;
    } else if ("expr" in definition) {
        accessor = mark.unitView.paramRuntime.createExpression(definition.expr);
    } else if ("datum" in definition) {
        accessor = () => definition.datum;
    } else if ("value" in definition) {
        accessor = () => definition.value;
    } else {
        throw new Error(
            "Invalid tooltip channel definition: " + JSON.stringify(definition)
        );
    }

    cache.set(definition, accessor);
    return accessor;
}

/**
 * @param {import("../spec/channel.js").TextDef} definition
 * @returns {string}
 */
function getTooltipTitle(definition) {
    if ("title" in definition && definition.title !== undefined) {
        return definition.title === null ? "" : definition.title;
    } else if ("field" in definition) {
        return definition.field;
    } else if ("expr" in definition) {
        return definition.expr;
    } else if ("datum" in definition) {
        return "datum";
    } else if ("value" in definition) {
        return "value";
    } else {
        throw new Error(
            "Invalid tooltip channel definition: " + JSON.stringify(definition)
        );
    }
}
```

- [ ] **Step 3: Run row-resolution tests**

Run:

```bash
npx vitest run packages/core/src/tooltip/configuredTooltipRows.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/tooltip/configuredTooltipRows.js packages/core/src/tooltip/configuredTooltipRows.test.js
git commit -m "feat(core): resolve configured tooltip rows"
```

---

### Task 4: Add Tooltip Rows to Tooltip Context

**Files:**
- Modify: `packages/core/src/tooltip/tooltipHandler.ts`
- Modify: `packages/core/src/tooltip/tooltipContext.js`
- Modify: `packages/core/src/tooltip/tooltipContext.test.js`

- [ ] **Step 1: Add failing context test**

In `packages/core/src/tooltip/tooltipContext.test.js`, add:

```js
test("exposes configured tooltip rows", () => {
    const datum = {
        sample: "S1",
        score: 7,
    };
    const mark = makeMark({
        encoders: {},
        encoding: {
            tooltip: [
                { field: "sample", title: "Sample" },
                { field: "score", title: "Score" },
            ],
        },
    });

    const context = createTooltipContext(datum, mark);

    expect(context.tooltipRows).toEqual([
        { key: "Sample", value: "S1", sourceField: "sample" },
        { key: "Score", value: 7, sourceField: "score" },
    ]);
});
```

If the local `makeMark()` helper in this file does not accept an `encoding` property yet, update the helper so it defaults to `encoding: {}` and allows tests to override it:

```js
function makeMark(options = {}) {
    return {
        encoders: options.encoders ?? {},
        encoding: options.encoding ?? {},
        unitView: {
            getScaleResolution: () => undefined,
            paramRuntime: {
                createExpression: (expr) => new Function("datum", `return ${expr};`),
            },
        },
        ...options,
    };
}
```

Run:

```bash
npx vitest run packages/core/src/tooltip/tooltipContext.test.js
```

Expected: FAIL because `context.tooltipRows` is not yet populated.

- [ ] **Step 2: Extend tooltip handler types**

In `packages/core/src/tooltip/tooltipHandler.ts`, update `TooltipRow` and `TooltipContext`:

```ts
export interface TooltipRow {
    key: string;
    value: any;
    sourceField?: string;
    formatted?: boolean;
}

export interface TooltipContext {
    /**
     * Rows selected by `encoding.tooltip`. If undefined, the default tooltip
     * handler uses flattened datum rows.
     */
    tooltipRows?: TooltipRow[];

    /**
     * A list of row keys that should be hidden from the default tooltip table.
     */
    hiddenRowKeys?: string[];
```

- [ ] **Step 3: Populate configured rows in context**

In `packages/core/src/tooltip/tooltipContext.js`, import the helper:

```js
import { getConfiguredTooltipRows } from "./configuredTooltipRows.js";
```

Then add `tooltipRows` to the returned context object:

```js
    return {
        tooltipRows: getConfiguredTooltipRows(datum, mark),
        hiddenRowKeys: [...hiddenRowKeys],
        genomicRows,
        flattenDatumRows: () => flattenDatumRows(datum),
        formatGenomicLocus: (axis, continuousPos) =>
            formatGenomicLocus(mark, axis, continuousPos),
        formatGenomicInterval: (axis, interval) =>
            formatGenomicInterval(mark, axis, interval),
    };
```

- [ ] **Step 4: Run context tests**

Run:

```bash
npx vitest run packages/core/src/tooltip/tooltipContext.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tooltip/tooltipHandler.ts packages/core/src/tooltip/tooltipContext.js packages/core/src/tooltip/tooltipContext.test.js
git commit -m "feat(core): expose configured tooltip rows"
```

---

### Task 5: Render Configured Rows in the Default Tooltip

**Files:**
- Modify: `packages/core/src/tooltip/dataTooltipHandler.js`
- Modify: `packages/core/src/tooltip/dataTooltipHandler.test.js`

- [ ] **Step 1: Add failing default-handler tests**

In `packages/core/src/tooltip/dataTooltipHandler.test.js`, add:

```js
test("Renders only configured tooltip rows when provided", async () => {
    const datum = {
        sample: "S1",
        score: 5,
        seq: "ACTG",
        qual: "IIII",
    };
    const mark = /** @type {any} */ ({
        encoders: {},
        unitView: {
            getTitleText: () => "",
        },
    });
    const context = {
        tooltipRows: [
            { key: "Sample", value: "S1", sourceField: "sample" },
            { key: "Score", value: 5, sourceField: "score" },
        ],
    };

    const content = await dataTooltipHandler(
        datum,
        mark,
        undefined,
        /** @type {any} */ (context)
    );
    const container = toContainer(content);

    const keys = Array.from(container.querySelectorAll("th")).map((el) =>
        el.textContent?.trim()
    );
    expect(keys).toEqual(["Sample", "Score"]);
});

test("Uses source fields for color legends when tooltip titles differ", async () => {
    const datum = {
        category: "A",
    };
    const fieldAccessor = /** @type {any} */ (
        Object.assign(() => datum.category, {
            constant: false,
            fields: ["category"],
        })
    );
    const fillEncoder = /** @type {any} */ (
        Object.assign(() => "#ff0000", {
            branches: [{ accessor: fieldAccessor }],
        })
    );
    const mark = /** @type {any} */ ({
        encoders: {
            fill: fillEncoder,
        },
        unitView: {
            getTitleText: () => "",
        },
    });
    const context = {
        tooltipRows: [
            { key: "Category label", value: "A", sourceField: "category" },
        ],
    };

    const content = await dataTooltipHandler(
        datum,
        mark,
        undefined,
        /** @type {any} */ (context)
    );
    const container = toContainer(content);

    expect(container.querySelector(".color-legend")).not.toBeNull();
});
```

Run:

```bash
npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js
```

Expected: FAIL because `context.tooltipRows` is ignored and legend lookup uses only `row.key`.

- [ ] **Step 2: Prefer configured rows in the handler**

In `packages/core/src/tooltip/dataTooltipHandler.js`, update the row setup:

```js
    const rawRows = tooltipContext.tooltipRows
        ? tooltipContext.tooltipRows
        : tooltipContext.flattenDatumRows
          ? tooltipContext.flattenDatumRows()
          : flattenDatumRows(datum);
```

- [ ] **Step 3: Use source fields for legend lookup**

In `packages/core/src/tooltip/dataTooltipHandler.js`, update `legend()` calls to pass the source field when present:

```js
    const visibleRawRows = rawRows.filter(
        (row) =>
            !hiddenRowKeys.has(row.key) ||
            legend(row.sourceField ?? row.key, row.value, datum)
    );
```

And in table rendering:

```js
    const tableContents = orderedRows.map((row) => {
        const value = row.formatted ? row.value : formatObject(row.value);
        const valueLegend = legend(row.sourceField ?? row.key, row.value, datum);
        return html`
            <tr>
                <th>${row.key}</th>
                <td>${value} ${valueLegend}</td>
            </tr>
        `;
    });
```

- [ ] **Step 4: Run default tooltip tests**

Run:

```bash
npx vitest run packages/core/src/tooltip/dataTooltipHandler.test.js
```

Expected: PASS.

- [ ] **Step 5: Run all tooltip tests**

Run:

```bash
npx vitest run packages/core/src/tooltip
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tooltip/dataTooltipHandler.js packages/core/src/tooltip/dataTooltipHandler.test.js
git commit -m "feat(core): render configured tooltip rows"
```

---

### Task 6: Document Tooltip Field Selection

**Files:**
- Modify: `docs/api/embed-options.md`
- Modify: `docs/grammar/mark/index.md`

- [ ] **Step 1: Update embed options docs**

In `docs/api/embed-options.md`, add this after the paragraph describing the `default` handler:

````md
Specs can choose which rows the `default` handler shows with
`encoding.tooltip`. If the channel is omitted, the handler shows the hovered
datum's properties. If the channel is `null`, raw datum rows are hidden for that
mark.

```json
{
  "mark": "point",
  "encoding": {
    "x": { "field": "position", "type": "quantitative" },
    "y": { "field": "score", "type": "quantitative" },
    "tooltip": [
      { "field": "sample", "title": "Sample" },
      { "field": "score", "title": "Score", "format": ".2f" }
    ]
  }
}
```

`mark.tooltip` still selects or disables the tooltip handler. `encoding.tooltip`
selects the rows passed to the default handler.
````

- [ ] **Step 2: Update grammar docs**

In `docs/grammar/mark/index.md`, add a short section near the encoding-channel documentation:

````md
### Tooltip Channel

The `tooltip` encoding channel controls which rows the default tooltip handler
shows for a hovered mark. A single field definition shows one row. An array of
field definitions shows multiple rows in the specified order.

```json
"encoding": {
  "tooltip": [
    { "field": "name", "title": "Read" },
    { "field": "mapq", "title": "Mapping quality" }
  ]
}
```

If `encoding.tooltip` is omitted, the default handler shows the hovered datum's
properties. If it is `null`, the default handler hides raw datum rows for that
mark. The `mark.tooltip` property is separate; it selects or disables the
tooltip handler.
````

- [ ] **Step 3: Run docs lint/build check**

Run:

```bash
npm run build:docs
```

Expected: PASS. If the docs build reports that generated schema docs are stale, run the schema/docs generation command used by the repo build in Task 8.

- [ ] **Step 4: Commit**

```bash
git add docs/api/embed-options.md docs/grammar/mark/index.md
git commit -m "docs: document tooltip encoding"
```

---

### Task 7: Use Tooltip Channel in BAM Read Alignments

**Files:**
- Modify: `examples/docs/genomic-data/examples/bam-read-alignments.json`

- [ ] **Step 1: Add tooltip rows to `read-backbone`**

In the `read-backbone` layer, add `encoding.tooltip` after `opacity`. Include useful read-level fields and omit `seq` and `qual`:

```json
                "tooltip": [
                  { "field": "name", "title": "Read" },
                  { "field": "chrom", "title": "Chromosome" },
                  { "field": "start", "title": "Start" },
                  { "field": "end", "title": "End" },
                  { "field": "strand", "title": "Strand" },
                  { "field": "mapq", "title": "Mapping quality" },
                  { "field": "cigar", "title": "CIGAR" }
                ]
```

The resulting `read-backbone` encoding should include no tooltip entries for `seq` or `qual`.

- [ ] **Step 2: Validate JSON formatting**

Run:

```bash
npx prettier --check examples/docs/genomic-data/examples/bam-read-alignments.json
```

Expected: PASS.

- [ ] **Step 3: Run an example smoke test**

Run:

```bash
npx vitest run packages/core/src/view/layoutSnapshot.test.js
```

Expected: PASS. This verifies representative spec parsing/layout paths still work after the example and schema changes.

- [ ] **Step 4: Commit**

```bash
git add examples/docs/genomic-data/examples/bam-read-alignments.json
git commit -m "docs: configure BAM read tooltip fields"
```

---

### Task 8: Regenerate Schema and Docs Artifacts

**Files:**
- Modify: `docs/schema.json`
- Modify: `docs/app-schema.json`
- Modify: generated docs artifacts if `npm run build:docs` updates them.

- [ ] **Step 1: Build schema artifacts**

Run:

```bash
npm run build
```

Expected: PASS and updated schema artifacts include `encoding.tooltip`.

- [ ] **Step 2: Build docs artifacts**

Run:

```bash
npm run build:docs
```

Expected: PASS and generated docs reflect the new tooltip channel documentation.

- [ ] **Step 3: Inspect generated diff**

Run:

```bash
git diff --stat
git diff -- docs/schema.json docs/app-schema.json docs/api/embed-options.md docs/grammar/mark/index.md examples/docs/genomic-data/examples/bam-read-alignments.json
```

Expected: schema changes are limited to the new tooltip channel and docs/example changes are intentional.

- [ ] **Step 4: Commit**

```bash
git add docs/schema.json docs/app-schema.json docs docs/examples
git commit -m "build: update tooltip schema and docs artifacts"
```

---

### Task 9: Final Verification

**Files:**
- No edits.

- [ ] **Step 1: Run focused tooltip and encoder tests**

Run:

```bash
npx vitest run packages/core/src/tooltip packages/core/src/encoder/encoder.test.js
```

Expected: PASS.

- [ ] **Step 2: Run workspace type checks**

Run:

```bash
npm --workspaces run test:tsc --if-present
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD~8..HEAD
git diff HEAD~8..HEAD -- examples/docs/genomic-data/examples/bam-read-alignments.json packages/core/src/spec/channel.d.ts packages/core/src/tooltip
```

Expected: the implementation adds tooltip field selection, docs mention the feature, and the BAM example uses `encoding.tooltip` without `seq` or `qual`.

---

## Acceptance Criteria

- `encoding.tooltip` supports one tooltip definition, multiple definitions, and `null`.
- Omitting `encoding.tooltip` preserves current default tooltip behavior.
- `mark.tooltip` continues to select or disable tooltip handlers.
- The default tooltip handler renders configured rows in order.
- Custom titles do not break color legend swatches because row source fields are preserved.
- The feature is documented in user-facing docs.
- `examples/docs/genomic-data/examples/bam-read-alignments.json` configures `read-backbone` tooltips without `seq` or `qual`.
- Focused tooltip tests, encoder tests, type checks, docs build, and lint pass.

## Self-Review Notes

- Spec coverage: the plan covers spec types, runtime behavior, default rendering, documentation, generated artifacts, and the BAM example use case.
- Placeholder scan: no task depends on unspecified implementation work; each code-edit task includes the intended code shape and verification command.
- Type consistency: the plan uses `TooltipDef`, `TooltipRow.sourceField`, `TooltipRow.formatted`, and `TooltipContext.tooltipRows` consistently across tasks.
