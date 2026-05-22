# Sample View Metadata Config Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the GenomeSpy App 1.0 SampleView schema by moving metadata source and metadata matrix layout configuration under a canonical `metadata` sibling while preserving existing specs through one centralized compatibility layer.

**Architecture:** Add a SampleView spec normalizer that accepts legacy and transitional author-facing shapes and returns one canonical internal shape. After normalization, SampleView internals read `spec.samples` for sample identity/labels and `spec.metadata` for metadata sources/layout, keeping compatibility logic out of UI and data-loading modules.

**Tech Stack:** JavaScript with JSDoc types, TypeScript declaration files for schema generation, Vitest, Markdown docs with `APP_SCHEMA` macros.

---

## Canonical 1.0 Shape

The documented 1.0 shape should be:

```json
{
  "samples": {
    "identity": {
      "data": { "url": "samples.tsv" },
      "idField": "sample",
      "displayNameField": "displayName"
    },
    "labelTitle": "Sample",
    "labelLength": 120,
    "labelFontSize": 11
  },
  "metadata": {
    "sources": [
      {
        "id": "clinical",
        "name": "Clinical metadata",
        "initialLoad": "*",
        "excludeColumns": ["displayName"],
        "backend": {
          "backend": "data",
          "data": { "url": "samples.tsv" },
          "sampleIdField": "sample"
        }
      }
    ],
    "attributeWidth": 10,
    "spacing": 1,
    "labelFontSize": 11,
    "labelAngle": -90
  },
  "spec": {
    "mark": "point",
    "encoding": {
      "sample": { "field": "sample" }
    }
  }
}
```

Compatibility input shapes:

- Legacy metadata table: `samples.data`, `samples.attributes`, `samples.attributeGroupSeparator`.
- Transitional metadata sources: `samples.metadataSources`.
- Legacy metadata layout: `samples.attributeSize`, `samples.attributeSpacing`, `samples.attributeLabelFont`, `samples.attributeLabelFontSize`, `samples.attributeLabelFontStyle`, `samples.attributeLabelFontWeight`, `samples.attributeLabelAngle`.
- Legacy sample label alias: `samples.labelTitleText`.

For `backend: "data"`, the field named by `sampleIdField` is a join key and
must be excluded from imported metadata implicitly. Authors should not need to
repeat it in `excludeColumns`; `excludeColumns` is only for other helper fields
such as display labels.

---

## File Structure

- Create `packages/app/src/sampleView/sampleViewSpecNormalizer.js`
  - Owns all SampleView author-facing compatibility rules.
  - Exports `normalizeSampleViewSpec(spec)`.
  - Returns `{ spec, warnings }`.

- Create `packages/app/src/sampleView/sampleViewSpecNormalizer.test.js`
  - Tests legacy, transitional, canonical, and invalid mixed shapes.

- Modify `packages/app/src/spec/sampleView.d.ts`
  - Add canonical `MetadataDef`.
  - Add `metadata?: MetadataDef` to `SampleSpec`.
  - Remove compatibility-only fields from public schema types so generated schema
    validators and editors accept only the 1.0 shape.

- Modify `packages/app/src/sampleView/sampleView.js`
  - Call `normalizeSampleViewSpec(spec)` once in the constructor.
  - Emit returned warnings once.
  - Remove direct use of `normalizeSampleDefMetadataSources`.

- Modify `packages/app/src/sampleView/metadata/metadataSourceSpec.js`
  - Either fold its logic into `sampleViewSpecNormalizer.js` or keep only small pure helpers imported by the normalizer.
  - Do not call this module from `SampleView` after the refactor.

- Modify `packages/app/src/sampleView/metadata/metadataSourceAdapters.js`
  - Resolve metadata source entries from canonical `metadata.sources`.

- Modify `packages/app/src/sampleView/metadata/metadataSourceBootstrap.js`
  - Pass canonical metadata config to source resolution.

- Modify `packages/app/src/sampleView/metadata/metadataSourceFlow.js`
  - Use canonical metadata config.

- Modify `packages/app/src/sampleView/metadata/metadataSourceMenu.js`
  - Use canonical metadata config.

- Modify `packages/app/src/sampleView/metadata/metadataView.js`
  - Read layout from `sampleView.spec.metadata`.
  - Use cleaned names: `attributeWidth`, `spacing`, `labelFont`, `labelFontSize`, `labelFontStyle`, `labelFontWeight`, `labelAngle`.

- Modify `packages/app/src/sampleView/sampleLabelView.js`
  - Remove local `labelTitleText` compatibility handling after it moves to the normalizer.

- Modify docs:
  - `docs/sample-collections/visualizing.md`
  - `docs/sample-collections/metadata-sources.md`
  - Any examples under `examples/` or `private/` that should demonstrate the 1.0 shape.

Every implementation task must end with a commit. Commit failing tests when the
task intentionally creates a red test; the following task should make that test
pass in a separate commit.

---

### Task 1: Add Normalizer Tests

**Files:**
- Create: `packages/app/src/sampleView/sampleViewSpecNormalizer.test.js`

- [ ] **Step 1: Write tests for canonical specs**

Create `packages/app/src/sampleView/sampleViewSpecNormalizer.test.js`:

```js
// @ts-check
import { describe, expect, it } from "vitest";
import { normalizeSampleViewSpec } from "./sampleViewSpecNormalizer.js";

describe("normalizeSampleViewSpec", () => {
    it("returns canonical metadata config unchanged", () => {
        const spec = {
            samples: {
                identity: {
                    data: { url: "samples.tsv" },
                    idField: "sample",
                    displayNameField: "displayName",
                },
                labelTitle: "Case",
            },
            metadata: {
                sources: [
                    {
                        id: "clinical",
                        backend: {
                            backend: "data",
                            data: { url: "samples.tsv" },
                        },
                    },
                ],
                attributeWidth: 12,
                spacing: 2,
                labelAngle: -45,
            },
            spec: { mark: "point" },
        };

        const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

        expect(normalized.spec).toBe(spec);
        expect(normalized.warnings).toEqual([]);
    });
});
```

- [ ] **Step 2: Add tests for legacy metadata table mapping**

Append:

```js
it("maps legacy samples.data metadata fields to canonical metadata.sources", () => {
    const spec = {
        samples: {
            data: { url: "samples.tsv" },
            attributeGroupSeparator: ".",
            attributes: {
                clinical: { type: "quantitative" },
            },
        },
        spec: { mark: "point" },
    };

    const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

    expect(normalized.spec.samples.identity).toEqual({
        data: { url: "samples.tsv" },
        idField: "sample",
        displayNameField: "displayName",
    });
    expect(normalized.spec.metadata.sources).toEqual([
        {
            initialLoad: "*",
            excludeColumns: ["displayName"],
            attributeGroupSeparator: ".",
            attributes: {
                clinical: { type: "quantitative" },
            },
            backend: {
                backend: "data",
                data: { url: "samples.tsv" },
                sampleIdField: "sample",
            },
        },
    ]);
    expect(normalized.warnings).toHaveLength(1);
});
```

- [ ] **Step 3: Add tests for transitional `samples.metadataSources`**

Append:

```js
it("maps samples.metadataSources to canonical metadata.sources", () => {
    const spec = {
        samples: {
            metadataSources: [
                {
                    id: "source",
                    backend: {
                        backend: "zarr",
                        url: "expression.zarr",
                    },
                },
            ],
        },
        spec: { mark: "point" },
    };

    const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

    expect(normalized.spec.metadata.sources).toEqual(
        spec.samples.metadataSources
    );
    expect(normalized.warnings).toHaveLength(1);
});
```

- [ ] **Step 4: Add tests for metadata layout property mapping**

Append:

```js
it("maps legacy metadata layout properties from samples to metadata", () => {
    const spec = {
        samples: {
            attributeSize: 14,
            attributeSpacing: 3,
            attributeLabelFont: "Lato",
            attributeLabelFontSize: 13,
            attributeLabelFontStyle: "italic",
            attributeLabelFontWeight: "bold",
            attributeLabelAngle: 15,
        },
        spec: { mark: "point" },
    };

    const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

    expect(normalized.spec.metadata).toMatchObject({
        attributeWidth: 14,
        spacing: 3,
        labelFont: "Lato",
        labelFontSize: 13,
        labelFontStyle: "italic",
        labelFontWeight: "bold",
        labelAngle: -75,
    });
});
```

- [ ] **Step 5: Add tests for rejected mixed source shapes**

Append:

```js
it("rejects metadata.sources mixed with samples.metadataSources", () => {
    const spec = {
        samples: {
            metadataSources: [
                {
                    id: "old",
                    backend: { backend: "data", data: { url: "old.tsv" } },
                },
            ],
        },
        metadata: {
            sources: [
                {
                    id: "new",
                    backend: { backend: "data", data: { url: "new.tsv" } },
                },
            ],
        },
        spec: { mark: "point" },
    };

    expect(() =>
        normalizeSampleViewSpec(/** @type {any} */ (spec))
    ).toThrow("Cannot combine metadata.sources with samples.metadataSources");
});
```

- [ ] **Step 6: Run the focused test and confirm it fails**

Run:

```bash
npx vitest run packages/app/src/sampleView/sampleViewSpecNormalizer.test.js
```

Expected: FAIL because `sampleViewSpecNormalizer.js` does not exist yet.

- [ ] **Step 7: Commit failing normalizer tests**

```bash
git add packages/app/src/sampleView/sampleViewSpecNormalizer.test.js
git commit -m "test(app): cover sample view spec normalization"
```

---

### Task 2: Implement Central Normalizer

**Files:**
- Create: `packages/app/src/sampleView/sampleViewSpecNormalizer.js`
- Modify: `packages/app/src/sampleView/metadata/metadataSourceSpec.js`
- Test: `packages/app/src/sampleView/sampleViewSpecNormalizer.test.js`

- [ ] **Step 1: Create `sampleViewSpecNormalizer.js`**

Implement a pure normalizer:

```js
// @ts-check

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleSpec} SampleSpec
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("@genome-spy/core/spec/data.js").Data} Data
 * @typedef {import("@genome-spy/core/spec/data.js").InlineData} InlineData
 * @typedef {import("@genome-spy/core/spec/data.js").UrlData} UrlData
 */

const LEGACY_SAMPLE_METADATA_FIELDS =
    "samples.data, samples.attributeGroupSeparator, and samples.attributes";

export const LEGACY_SAMPLE_METADATA_WARNING =
    "The " +
    LEGACY_SAMPLE_METADATA_FIELDS +
    " properties are deprecated. Use metadata.sources instead.";

export const TRANSITIONAL_METADATA_SOURCES_WARNING =
    "samples.metadataSources is deprecated. Use metadata.sources instead.";

export const LEGACY_METADATA_LAYOUT_WARNING =
    "Metadata layout properties under samples are deprecated. Use metadata layout properties instead.";

export const LEGACY_LABEL_TITLE_TEXT_WARNING =
    "samples.labelTitleText is deprecated. Use samples.labelTitle instead.";

/**
 * @param {Data} data
 * @returns {data is UrlData | InlineData}
 */
function isUrlOrInlineData(data) {
    return (
        data !== null &&
        typeof data === "object" &&
        ("url" in data || "values" in data)
    );
}

/**
 * @param {Record<string, unknown>} sampleDef
 * @returns {boolean}
 */
function hasLegacyMetadataFields(sampleDef) {
    return (
        sampleDef.data !== undefined ||
        sampleDef.attributeGroupSeparator !== undefined ||
        sampleDef.attributes !== undefined
    );
}

/**
 * @param {Record<string, unknown>} sampleDef
 * @returns {Record<string, unknown>}
 */
function extractLegacyMetadataLayout(sampleDef) {
    /** @type {Record<string, unknown>} */
    const metadataLayout = {};

    if (sampleDef.attributeSize !== undefined) {
        metadataLayout.attributeWidth = sampleDef.attributeSize;
    }
    if (sampleDef.attributeSpacing !== undefined) {
        metadataLayout.spacing = sampleDef.attributeSpacing;
    }
    if (sampleDef.attributeLabelFont !== undefined) {
        metadataLayout.labelFont = sampleDef.attributeLabelFont;
    }
    if (sampleDef.attributeLabelFontSize !== undefined) {
        metadataLayout.labelFontSize = sampleDef.attributeLabelFontSize;
    }
    if (sampleDef.attributeLabelFontStyle !== undefined) {
        metadataLayout.labelFontStyle = sampleDef.attributeLabelFontStyle;
    }
    if (sampleDef.attributeLabelFontWeight !== undefined) {
        metadataLayout.labelFontWeight = sampleDef.attributeLabelFontWeight;
    }
    if (sampleDef.attributeLabelAngle !== undefined) {
        metadataLayout.labelAngle =
            -90 + /** @type {number} */ (sampleDef.attributeLabelAngle);
    }

    return metadataLayout;
}

/**
 * @param {Record<string, unknown>} sampleDef
 * @returns {MetadataSourceDef}
 */
function createLegacyMetadataSource(sampleDef) {
    const data = /** @type {Data} */ (sampleDef.data);
    if (!isUrlOrInlineData(data)) {
        throw new Error(
            "Legacy samples.data must be UrlData or InlineData when mapping to metadata.sources."
        );
    }

    /** @type {MetadataSourceDef} */
    const source = {
        initialLoad: "*",
        excludeColumns: ["displayName"],
        backend: {
            backend: "data",
            data,
            sampleIdField: "sample",
        },
    };

    if (sampleDef.attributeGroupSeparator !== undefined) {
        source.attributeGroupSeparator = /** @type {string} */ (
            sampleDef.attributeGroupSeparator
        );
    }
    if (sampleDef.attributes !== undefined) {
        source.attributes = /** @type {Record<string, import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef>} */ (
            sampleDef.attributes
        );
    }

    return source;
}

/**
 * @param {SampleSpec} spec
 * @returns {{ spec: SampleSpec; warnings: string[] }}
 */
export function normalizeSampleViewSpec(spec) {
    const sampleDef = /** @type {Record<string, unknown>} */ (
        spec.samples ?? {}
    );
    const metadataDef = /** @type {Record<string, unknown>} */ (
        spec.metadata ?? {}
    );
    const warnings = [];

    const hasCanonicalSources = metadataDef.sources !== undefined;
    const hasTransitionalSources = sampleDef.metadataSources !== undefined;
    const hasLegacyMetadata = hasLegacyMetadataFields(sampleDef);

    if (hasCanonicalSources && hasTransitionalSources) {
        throw new Error(
            "Cannot combine metadata.sources with samples.metadataSources. Use metadata.sources only."
        );
    }
    if (hasCanonicalSources && hasLegacyMetadata) {
        throw new Error(
            "Cannot combine metadata.sources with legacy sample metadata fields (" +
                LEGACY_SAMPLE_METADATA_FIELDS +
                "). Use metadata.sources only."
        );
    }
    if (hasTransitionalSources && hasLegacyMetadata) {
        throw new Error(
            "Cannot combine samples.metadataSources with legacy sample metadata fields (" +
                LEGACY_SAMPLE_METADATA_FIELDS +
                "). Use metadata.sources only."
        );
    }

    const legacyMetadataLayout = extractLegacyMetadataLayout(sampleDef);
    const hasLegacyMetadataLayout = Object.keys(legacyMetadataLayout).length > 0;

    /** @type {Record<string, unknown>} */
    const normalizedSamples = { ...sampleDef };
    /** @type {Record<string, unknown>} */
    const normalizedMetadata = { ...metadataDef };
    let changed = false;

    if (sampleDef.labelTitleText !== undefined && sampleDef.labelTitle === undefined) {
        normalizedSamples.labelTitle = sampleDef.labelTitleText;
        changed = true;
        warnings.push(LEGACY_LABEL_TITLE_TEXT_WARNING);
    }

    if (hasLegacyMetadata) {
        normalizedSamples.identity =
            sampleDef.identity ??
            {
                data: sampleDef.data,
                idField: "sample",
                displayNameField: "displayName",
            };
        normalizedMetadata.sources = [createLegacyMetadataSource(sampleDef)];
        changed = true;
        warnings.push(LEGACY_SAMPLE_METADATA_WARNING);
    } else if (hasTransitionalSources) {
        normalizedMetadata.sources = sampleDef.metadataSources;
        changed = true;
        warnings.push(TRANSITIONAL_METADATA_SOURCES_WARNING);
    }

    if (hasLegacyMetadataLayout) {
        Object.assign(normalizedMetadata, legacyMetadataLayout, metadataDef);
        changed = true;
        warnings.push(LEGACY_METADATA_LAYOUT_WARNING);
    }

    if (!changed) {
        return { spec, warnings };
    }

    return {
        spec: {
            ...spec,
            samples: normalizedSamples,
            metadata: normalizedMetadata,
        },
        warnings,
    };
}
```

- [ ] **Step 2: Run focused normalizer tests**

Run:

```bash
npx vitest run packages/app/src/sampleView/sampleViewSpecNormalizer.test.js
```

Expected: PASS.

- [ ] **Step 3: Remove or delegate old normalizer entry point**

Keep `packages/app/src/sampleView/metadata/metadataSourceSpec.js` only if existing imports still need it during the transition. If kept, make it import and call `normalizeSampleViewSpec` to avoid two compatibility implementations.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/sampleView/sampleViewSpecNormalizer.js packages/app/src/sampleView/sampleViewSpecNormalizer.test.js packages/app/src/sampleView/metadata/metadataSourceSpec.js
git commit -m "refactor(app): centralize sample view spec compatibility"
```

---

### Task 3: Make Data Backend Sample Id Exclusion Implicit

**Files:**
- Modify: `packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.js`
- Modify: `packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.test.js`
- Modify: `packages/app/src/spec/sampleView.d.ts`

- [ ] **Step 1: Add a failing adapter test**

In `packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.test.js`, add a test using a non-default sample id field:

```js
it("excludes sampleIdField from imported metadata implicitly", async () => {
    const adapter = new DataMetadataSourceAdapter({
        backend: {
            backend: "data",
            data: {
                values: [
                    { sid: "s1", displayName: "Sample 1", purity: 0.8 },
                    { sid: "s2", displayName: "Sample 2", purity: 0.6 },
                ],
            },
            sampleIdField: "sid",
        },
        excludeColumns: ["displayName"],
    });

    const columns = await adapter.listColumns();
    expect(columns.map((column) => column.id)).toEqual(["purity"]);

    const resolved = await adapter.resolveColumns(["sid", "purity"]);
    expect(resolved.columnIds).toEqual(["purity"]);
    expect(resolved.missing).toEqual(["sid"]);

    await expect(
        adapter.fetchColumns({
            columnIds: ["sid"],
            sampleIds: ["s1"],
        })
    ).rejects.toThrow(
        'Column "sid" is excluded by metadata source configuration.'
    );
});
```

This test covers both discovery and explicit import. `listColumns()` already
skips `sampleIdField`; the important regression guard is that `fetchColumns()`
also rejects the join key when requested directly.

- [ ] **Step 2: Run the focused adapter test**

Run:

```bash
npx vitest run packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.test.js
```

Expected: FAIL until the adapter excludes `sampleIdField` internally.

- [ ] **Step 3: Commit failing adapter test**

```bash
git add packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.test.js
git commit -m "test(app): cover implicit metadata sample id exclusion"
```

- [ ] **Step 4: Implement implicit exclusion**

In the data metadata adapter, combine explicit excludes with the backend sample
id field:

```js
const sampleIdField = source.backend.sampleIdField ?? "sample";
const excludedColumns = new Set([
    sampleIdField,
    ...(source.excludeColumns ?? []),
]);
```

Use `excludedColumns` anywhere imported metadata columns are filtered.

- [ ] **Step 5: Update schema docs for `excludeColumns`**

In `packages/app/src/spec/sampleView.d.ts`, update `MetadataSourceDef.excludeColumns`
JSDoc:

```ts
/**
 * Column ids that must never be imported from this source.
 *
 * The data backend always excludes its `sampleIdField` automatically, so this
 * property is only needed for other helper columns such as display labels.
 */
excludeColumns?: string[];
```

- [ ] **Step 6: Run focused adapter tests**

Run:

```bash
npx vitest run packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit implementation**

```bash
git add packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.js packages/app/src/sampleView/metadata/adapters/dataMetadataSourceAdapter.test.js packages/app/src/spec/sampleView.d.ts
git commit -m "fix(app): exclude metadata sample id fields implicitly"
```

---

### Task 4: Update Public Schema Types

**Files:**
- Modify: `packages/app/src/spec/sampleView.d.ts`
- Test: schema/type generation through package checks

- [ ] **Step 1: Add canonical metadata config types**

In `packages/app/src/spec/sampleView.d.ts`, add:

```ts
export interface MetadataDef {
    /**
     * Metadata source definitions used for startup and on-demand imports.
     *
     * Source order is significant for startup loading: eager startup imports are
     * applied in declaration order.
     */
    sources?: MetadataSourceEntry[];

    /**
     * Default width of metadata attribute columns in pixels.
     *
     * __Default value:__ `10`
     */
    attributeWidth?: number;

    /**
     * Spacing between metadata attribute columns in pixels.
     *
     * __Default value:__ `1`
     */
    spacing?: number;

    /**
     * Font typeface for metadata attribute labels.
     *
     * __Default value:__ `"Lato"`
     */
    labelFont?: string;

    /**
     * Font style for metadata attribute labels.
     *
     * __Default value:__ `"normal"`
     */
    labelFontStyle?: FontStyle;

    /**
     * Font weight for metadata attribute labels.
     *
     * __Default value:__ `"regular"`
     */
    labelFontWeight?: FontWeight;

    /**
     * Font size for metadata attribute labels in pixels.
     *
     * __Default value:__ `11`
     */
    labelFontSize?: number;

    /**
     * Angle of metadata attribute labels in degrees.
     *
     * __Default value:__ `-90`
     */
    labelAngle?: number;
}
```

- [ ] **Step 2: Add `metadata` to `SampleSpec`**

Add near `samples`:

```ts
/**
 * Metadata source and metadata matrix layout configuration.
 */
metadata?: MetadataDef;
```

- [ ] **Step 3: Remove compatibility-only fields from generated schema types**

Remove these fields from the public `SampleDef` interface in
`packages/app/src/spec/sampleView.d.ts`:

```ts
metadataSources?: MetadataSourceEntry[];
data?: Data;
attributeGroupSeparator?: string;
attributes?: Record<string, SampleAttributeDef>;
labelTitleText?: string | null;
attributeSize?: number;
attributeLabelFont?: string;
attributeLabelFontStyle?: FontStyle;
attributeLabelFontWeight?: FontWeight;
attributeLabelFontSize?: number;
attributeLabelAngle?: number;
attributeSpacing?: number;
```

Do not keep these as `@deprecated` fields in schema-facing `.d.ts` files. They
are supported only by the runtime normalizer for old specs, and it is acceptable
for validators/editors using the generated schema to report them as invalid.

- [ ] **Step 4: Keep compatibility fields untyped in the normalizer**

In `sampleViewSpecNormalizer.js`, do not define local types for old fields. Treat
the input at the compatibility boundary as unknown object structure:

```js
const sampleDef = /** @type {Record<string, unknown>} */ (
    spec.samples ?? {}
);
const metadataDef = /** @type {Record<string, unknown>} */ (
    spec.metadata ?? {}
);
```

Old property names should appear only as local string-key reads in the
normalizer and as compatibility test fixtures. Do not recreate a shadow type for
fields that should not be accepted by generated schema validators.

- [ ] **Step 5: Run TypeScript/schema-related checks**

Run:

```bash
npm --workspaces run test:tsc --if-present
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/spec/sampleView.d.ts packages/app/src/sampleView/sampleViewSpecNormalizer.js
git commit -m "refactor(app): define canonical metadata config schema"
```

---

### Task 5: Wire SampleView to Canonical Spec

**Files:**
- Modify: `packages/app/src/sampleView/sampleView.js`
- Modify: `packages/app/src/sampleView/sampleLabelView.js`
- Test: `packages/app/src/sampleView/sampleView.test.js`

- [ ] **Step 1: Update SampleView constructor**

Replace the existing `normalizeSampleDefMetadataSources` call in `sampleView.js` with:

```js
import { normalizeSampleViewSpec } from "./sampleViewSpecNormalizer.js";
```

Then in the constructor:

```js
const normalized = normalizeSampleViewSpec(spec);
for (const warning of normalized.warnings) {
    console.warn(warning);
}

this.spec = normalized.spec;
```

Keep `super(spec, ...)` unchanged unless layout initialization requires canonical fields before superclass construction.

- [ ] **Step 2: Remove local label title alias handling**

In `sampleLabelView.js`, update `getLabelTitle` to read only:

```js
function getLabelTitle(sampleDef) {
    return sampleDef.labelTitle ?? "Sample";
}
```

The normalizer now maps `labelTitleText` to `labelTitle`.

- [ ] **Step 3: Add SampleView compatibility smoke tests**

In `packages/app/src/sampleView/sampleView.test.js`, add or update tests so they create SampleView specs using:

```js
metadata: {
    sources: [
        {
            backend: {
                backend: "data",
                data: {
                    values: [
                        { sample: "A", clinical: "yes" },
                        { sample: "B", clinical: "no" },
                    ],
                },
            },
        },
    ],
},
```

Expected: no deprecation warning for canonical `metadata.sources`.

- [ ] **Step 4: Run focused SampleView tests**

Run:

```bash
npx vitest run packages/app/src/sampleView/sampleView.test.js packages/app/src/sampleView/sampleViewSpecNormalizer.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/sampleView/sampleView.js packages/app/src/sampleView/sampleLabelView.js packages/app/src/sampleView/sampleView.test.js
git commit -m "refactor(app): normalize sample view specs at construction"
```

---

### Task 6: Move Metadata Runtime Reads to `spec.metadata`

**Files:**
- Modify: `packages/app/src/sampleView/metadata/metadataView.js`
- Modify: `packages/app/src/sampleView/metadata/metadataSourceAdapters.js`
- Modify: `packages/app/src/sampleView/metadata/metadataSourceBootstrap.js`
- Modify: `packages/app/src/sampleView/metadata/metadataSourceFlow.js`
- Modify: `packages/app/src/sampleView/metadata/metadataSourceMenu.js`
- Test: metadata source and metadata view tests

- [ ] **Step 1: Update `metadataView.js` layout reads**

Use:

```js
const metadataDef = sampleView.spec.metadata ?? {};
```

Then replace:

```js
sampleView.spec.samples.attributeSpacing ?? 1
```

with:

```js
metadataDef.spacing ?? 1
```

In `createAttributeSpec`, accept `metadataDef` instead of `sampleDef` and map:

```js
angle: metadataDef.labelAngle ?? -90,
font: metadataDef.labelFont,
fontSize: metadataDef.labelFontSize ?? 11,
fontStyle: metadataDef.labelFontStyle,
fontWeight: metadataDef.labelFontWeight,
width: attributeDef.width ?? metadataDef.attributeWidth ?? 10,
```

- [ ] **Step 2: Update metadata source resolution call sites**

Change source resolution helpers so callers pass `sampleView.spec.metadata` or `sampleView.spec.metadata?.sources ?? []`, not `sampleView.spec.samples`.

Use a small helper if needed:

```js
function getMetadataSources(metadataDef) {
    return metadataDef?.sources ?? [];
}
```

- [ ] **Step 3: Update tests that construct source stubs**

Tests in metadata modules currently create stubs like:

```js
spec: {
    samples: {
        metadataSources: sources,
    },
}
```

Change them to:

```js
spec: {
    samples: {},
    metadata: {
        sources,
    },
}
```

- [ ] **Step 4: Run focused metadata tests**

Run:

```bash
npx vitest run packages/app/src/sampleView/metadata/metadataSourceSpec.test.js packages/app/src/sampleView/metadata/metadataSourceAdapters.test.js packages/app/src/sampleView/metadata/metadataSourceBootstrap.test.js packages/app/src/sampleView/metadata/metadataSourceFlow.test.js
```

Expected: PASS after tests are updated or obsolete tests are moved to `sampleViewSpecNormalizer.test.js`.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/sampleView/metadata packages/app/src/sampleView/sampleViewSpecNormalizer.test.js
git commit -m "refactor(app): read metadata config from canonical metadata block"
```

---

### Task 7: Update Documentation and Examples

**Files:**
- Modify: `docs/sample-collections/visualizing.md`
- Modify: `docs/sample-collections/metadata-sources.md`
- Modify: `private/genomespy-paper-2024-spec/spec.json`
- Optionally modify examples under `examples/` if any should demonstrate metadata sources.

- [ ] **Step 1: Update `visualizing.md`**

Change the minimal sample definition section to describe:

1. sample identity under `samples.identity`
2. metadata sources under `metadata.sources`
3. metadata layout under `metadata`

Use this schematic:

```json
{
  "samples": {
    "identity": {
      "data": { "url": "samples.tsv" },
      "idField": "sample",
      "displayNameField": "displayName"
    }
  },
  "metadata": {
    "sources": [
      {
        "id": "clinical",
        "name": "Clinical metadata",
        "initialLoad": "*",
        "excludeColumns": ["displayName"],
        "backend": {
          "backend": "data",
          "data": { "url": "samples.tsv" },
          "sampleIdField": "sample"
        }
      }
    ]
  },
  "spec": {
    "encoding": {
      "sample": { "field": "sample" }
    }
  }
}
```

- [ ] **Step 2: Update metadata layout docs**

Replace the current text saying metadata attribute styling lives in `samples` with text saying it lives in `metadata`:

```md
The `metadata` object controls metadata sources and metadata matrix layout.
```

Update `APP_SCHEMA` macros to reference `MetadataDef` for metadata layout props.

- [ ] **Step 3: Update `metadata-sources.md`**

Replace every documented `samples.metadataSources` example with `metadata.sources`.

Update the schema reference:

```md
### Sample and metadata entry points

APP_SCHEMA SampleDef identity

APP_SCHEMA MetadataDef sources attributeWidth spacing labelFont labelFontSize labelFontWeight labelFontStyle labelAngle
```

Keep one short migration note that says older `samples.data`, `samples.attributes`, and `samples.metadataSources` remain supported for compatibility but are not the documented 1.0 shape.

- [ ] **Step 4: Update the paper spec**

In `private/genomespy-paper-2024-spec/spec.json`, move:

```json
"metadataSources": [ ... ]
```

from `samples` to:

```json
"metadata": {
  "sources": [ ... ]
}
```

Keep the DECIDER source exclusion as:

```json
"excludeColumns": ["displayName"]
```

Do not include the source `sampleIdField` in `excludeColumns`; the data backend
excludes it implicitly.

- [ ] **Step 5: Build docs/schema artifacts if required**

Run:

```bash
npm run build && npm run build:docs
```

Expected: PASS. If this is too slow for local iteration, run at least:

```bash
npm --workspaces run test:tsc --if-present
```

and note that full docs build remains to be run.

- [ ] **Step 6: Commit**

```bash
git add docs/sample-collections/visualizing.md docs/sample-collections/metadata-sources.md private/genomespy-paper-2024-spec/spec.json docs/app-schema.json docs/schema.json
git commit -m "docs(app): document canonical sample metadata config"
```

---

### Task 8: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Search for old documented canonical shape**

Run:

```bash
rg -n "samples\\.metadataSources|attributeLabelAngle|attributeSpacing|attributeSize|labelTitleText" docs packages/app/src private examples
```

Expected:

- In docs, old names appear only in migration/deprecation notes.
- In source, old names appear only in `sampleViewSpecNormalizer.js` and compatibility tests.
- In generated schema, old names do not appear as accepted properties.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npx vitest run packages/app/src/sampleView/sampleViewSpecNormalizer.test.js packages/app/src/sampleView/sampleView.test.js packages/app/src/sampleView/metadata/metadataSourceAdapters.test.js packages/app/src/sampleView/metadata/metadataSourceBootstrap.test.js packages/app/src/sampleView/metadata/metadataSourceFlow.test.js
```

Expected: PASS.

- [ ] **Step 3: Run workspace checks**

Run:

```bash
npm --workspaces run test:tsc --if-present
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Inspect diff**

Run:

```bash
git diff --stat
git diff
```

Expected: compatibility logic is centralized; runtime reads use canonical `metadata`; docs show only the 1.0 shape except for migration notes.

- [ ] **Step 5: Commit final verification fixes**

```bash
git add packages/app docs private examples
git commit -m "test(app): verify sample metadata config migration"
```

If there are no changes after verification, make an empty verification commit:

```bash
git commit --allow-empty -m "test(app): verify sample metadata config migration"
```

---

## Notes and Decisions

- Do not expose additional metadata label offset or `dy` props.
- Keep `metadata.labelAngle` as the actual rendered angle. Legacy `samples.attributeLabelAngle` remains an offset from `-90` only inside the compatibility normalizer.
- Exclude the data backend `sampleIdField` implicitly. Do not document `excludeColumns: ["sample", ...]` as the normal pattern.
- Do not expose deprecated compatibility fields in the generated schema. Runtime
  compatibility is for loading old specs; schema validation should guide authors
  toward the 1.0 shape.
- Keep old specs working, but do not document old or transitional shapes as normal authoring patterns.
- Prefer errors for mixed source definitions because merging two source lists can silently change startup metadata import order.
- Keep migration warnings specific enough for authors to find the replacement field.

## Self-Review

- Spec coverage: The plan covers canonical schema, compatibility normalization, runtime reads, tests, docs, public schema exclusion for compatibility-only fields, and example migration.
- Placeholder scan: No `TBD` or unspecified implementation steps remain.
- Type consistency: The canonical property names are `metadata.sources`, `metadata.attributeWidth`, `metadata.spacing`, `metadata.labelFont`, `metadata.labelFontSize`, `metadata.labelFontStyle`, `metadata.labelFontWeight`, and `metadata.labelAngle`.
