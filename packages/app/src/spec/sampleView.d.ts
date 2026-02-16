import { Data, InlineData, UrlData } from "@genome-spy/core/spec/data.js";
import { Align, FontStyle, FontWeight } from "@genome-spy/core/spec/font.js";
import { Scale } from "@genome-spy/core/spec/scale.js";
import { ViewSpecBase, ViewBackground } from "@genome-spy/core/spec/view.js";
import { AppLayerSpec, AppNestedViewSpec, AppUnitSpec } from "./view.js";

/**
 * A view specification for a SampleView.
 */
export interface SampleSpec extends Omit<ViewSpecBase, "templates"> {
    /**
     * Sample metadata definition.
     * If the object is empty, the sample identifiers will be inferred from the data.
     */
    samples: SampleDef;

    /**
     * An object defining the view background and outline. The background is
     * repeated for each group.
     */
    view?: ViewBackground;

    /**
     * The view specification to be repeated for each sample.
     */
    spec: AppLayerSpec | AppUnitSpec;

    // Templates inside a SampleSpec may only produce non-sample descendants.
    // This keeps SampleView as a top-level/sibling concept instead of nestable.
    templates?: Record<string, AppNestedViewSpec>;

    stickySummaries?: boolean;
}

export type SampleAttributeType = "nominal" | "ordinal" | "quantitative";

export interface SampleAttributeDef {
    /**
     * The attribute type. One of `"nominal"`, `"ordinal"`, or `"quantitative"`.
     */
    type?: SampleAttributeType;

    /**
     * Scale definition for the (default) color channel
     */
    scale?: Scale;

    /**
     * An optional scale definition for mapping the attribute to
     * the width of a metadata rectangle.
     */
    barScale?: Scale;

    /**
     * Width of the column in pixels.
     */
    width?: number;

    /**
     * Whether the attribute is visible by default.
     */
    visible?: boolean;

    /**
     * The title of the attribute. Defaults to attribute name.
     */
    title?: string;
}

export interface SampleIdentityDef {
    /**
     * Data source that defines the canonical sample set for the view.
     *
     * The source must contain one row per sample and is used to resolve sample
     * ids and optional display names before metadata imports are applied.
     */
    data: Data;

    /**
     * Field that contains the canonical sample id.
     *
     * __Default value:__ `"sample"`
     */
    idField?: string;

    /**
     * Field containing a user-visible sample label.
     *
     * If omitted, sample ids are used.
     */
    displayNameField?: string;
}

export interface ColumnIdentifierField {
    /**
     * Logical identifier name shown in UI and diagnostics.
     *
     * Example values: `"symbol"`, `"ensembl"`, `"entrez"`.
     */
    name: string;

    /**
     * Backend path that provides identifier values aligned to matrix columns.
     *
     * The array length must equal the number of columns in the matrix.
     */
    path: string;

    /**
     * Marks this identifier as the primary, canonical identifier.
     */
    primary?: boolean;

    /**
     * Enables case-insensitive matching for this identifier field.
     */
    caseInsensitive?: boolean;

    /**
     * Remove version suffixes during matching (for example, ENSG...`.12`).
     *
     * Useful for identifiers such as Ensembl ids that may contain version
     * suffixes in some datasets but not in user queries.
     */
    stripVersionSuffix?: boolean;
}

export interface ColumnSynonymIndex {
    /**
     * Backend path containing synonym terms.
     *
     * Terms are matched against user queries.
     */
    termPath: string;

    /**
     * Backend path containing resolved matrix column indices for terms.
     *
     * Must be aligned with `termPath` (same length, row-by-row mapping).
     */
    columnIndexPath: string;

    /**
     * Optional backend path describing synonym provenance (for example, source
     * database or curation source) for diagnostics.
     */
    sourcePath?: string;
}

export interface DataBackendDef {
    backend: "data";

    /**
     * Eager tabular metadata source using the standard data contract.
     *
     * Supports `UrlData` and `InlineData`.
     */
    data: UrlData | InlineData;

    /**
     * Field name in the table that matches sample ids in the view.
     *
     * __Default value:__ `"sample"`
     */
    sampleIdField?: string;
}

export interface ZarrMatrixLayoutDef {
    /**
     * Path to matrix values (sample rows x metadata columns).
     *
     * __Default value:__ `"X"`
     */
    valuesPath?: string;

    /**
     * Path to matrix row identifiers (sample ids).
     *
     * __Default value:__ `"obs_names"`
     */
    rowIdsPath?: string;

    /**
     * Path to matrix column identifiers.
     *
     * __Default value:__ `"var_names"`
     */
    columnIdsPath?: string;
}

export interface ZarrTableLayoutDef {
    /**
     * Path to the table-like array or group in the store.
     */
    path?: string;

    /**
     * Field containing sample ids in table rows.
     */
    sampleIdField?: string;
}

export interface ZarrBackendDef {
    backend: "zarr";

    /**
     * URL to the root of the Zarr store.
     */
    url: string;

    /**
     * Declares how metadata is represented in the store.
     *
     * - `"matrix"`: sample-by-column matrix with separate row/column id arrays
     * - `"table"`: tabular representation
     */
    layout: "matrix" | "table";

    /**
     * Matrix layout configuration.
     *
     * Required when `layout` is `"matrix"`.
     */
    matrix?: ZarrMatrixLayoutDef;

    /**
     * Table layout configuration.
     *
     * Required when `layout` is `"table"`.
     */
    table?: ZarrTableLayoutDef;

    /**
     * Optional identifier arrays used to resolve user queries to columns.
     *
     * If omitted, only primary column ids are used for lookup.
     */
    identifiers?: ColumnIdentifierField[];

    /**
     * Optional synonym index for expanding lookup terms to matrix columns.
     */
    synonymIndex?: ColumnSynonymIndex;
}

export interface ParquetBackendDef {
    backend: "parquet";

    /**
     * URL to a Parquet data source.
     *
     * Reserved for future use.
     */
    url: string;

    /**
     * Field containing sample ids.
     */
    sampleIdField: string;
}

export interface ArrowBackendDef {
    backend: "arrow";

    /**
     * URL to an Arrow data source.
     *
     * Reserved for future use.
     */
    url: string;

    /**
     * Field containing sample ids.
     */
    sampleIdField: string;
}

export type MetadataBackendDef =
    | DataBackendDef
    | ZarrBackendDef
    | ParquetBackendDef
    | ArrowBackendDef;

export interface MetadataSourceDef {
    /**
     * Stable source identifier used in actions, provenance, and configuration.
     *
     * Should remain stable across spec revisions if bookmarks/provenance replay
     * must keep working.
     */
    id?: string;

    /**
     * Optional user-facing label shown in menus and dialogs.
     *
     * If omitted, UI falls back to `id`.
     */
    name?: string;

    /**
     * Optional short description of what this source contains.
     *
     * Can be shown in UI and can help automated agents choose the correct
     * source.
     */
    description?: string;

    /**
     * Startup loading behavior.
     *
     * - `false`: do not load at startup
     * - `"*"`: load all columns allowed by this source
     * - `string[]`: resolve and load only the listed columns
     *
     * Omitted value uses backend defaults.
     */
    initialLoad?: false | "*" | string[];

    /**
     * Column ids that must never be imported from this source.
     *
     * Useful for excluding identity/helper columns such as `sample` and
     * `displayName`.
     */
    excludeColumns?: string[];

    /**
     * Default destination group path for imported attributes.
     *
     * Imported column names are placed under this path, which effectively
     * creates (or reuses) a metadata hierarchy node.
     *
     * This value is parsed as a path using `attributeGroupSeparator` when that
     * separator is defined for the source.
     *
     * Users can override this per import in the dialog.
     */
    groupPath?: string;

    /**
     * Separator used by source-side attribute names to express hierarchy.
     *
     * Example: if separator is `"."`, column `clinical.OS` is interpreted as
     * group `clinical` and attribute `OS`.
     */
    attributeGroupSeparator?: string;

    /**
     * Default attribute definition applied to imported columns.
     *
     * Per-column definitions in `columnDefs` take precedence.
     */
    defaultAttributeDef?: SampleAttributeDef;

    /**
     * Per-column attribute definitions keyed by column id.
     */
    columnDefs?: Record<string, SampleAttributeDef>;

    /**
     * Backend-specific source configuration.
     */
    backend: MetadataBackendDef;
}

export interface MetadataSourceImportDef {
    /**
     * URL to a standalone metadata source definition file.
     *
     * Imports are shallow: imported files must define exactly one source and
     * cannot contain nested `import` entries.
     */
    url: string;
}

export type MetadataSourceEntry =
    | MetadataSourceDef
    | { import: MetadataSourceImportDef };

export interface SampleDef {
    /**
     * Optional explicit sample identity definition.
     */
    identity?: SampleIdentityDef;

    /**
     * Metadata source definitions used for startup and on-demand imports.
     *
     * Source order is significant for startup loading: eager startup imports are
     * applied in declaration order.
     */
    metadataSources?: MetadataSourceEntry[];

    /**
     * Optional metadata about the samples.
     *
     * @deprecated Use `metadataSources` with `backend: "data"` instead.
     */
    data?: Data;

    /**
     * If attributes form a hierarchy, specify the separator character to
     * split the attribute names into paths.
     *
     * @deprecated Configure per-source `attributeGroupSeparator` in `metadataSources`.
     */
    attributeGroupSeparator?: string;

    /**
     * Explicitly specify the sample attributes.
     *
     * @deprecated Configure per-source `columnDefs` in `metadataSources`.
     */
    attributes?: Record<string, SampleAttributeDef>;

    /**
     * Text in the label title
     *
     * **Default:** `"Sample name"`
     */
    labelTitleText?: string;

    /**
     * How much space in pixels to reserve for the labels.
     *
     * **Default:** `140`
     */
    labelLength?: number;

    /**
     * The font typeface. GenomeSpy uses [SDF](https://github.com/Chlumsky/msdfgen)
     * versions of [Google Fonts](https://fonts.google.com/). Check their
     * availability at the [A-Frame
     * Fonts](https://github.com/etiennepinchon/aframe-fonts/tree/master/fonts)
     * repository. System fonts are **not** supported.
     *
     * **Default value:** `"Lato"`
     */
    labelFont?: string;

    /**
     * The font style. Valid values: `"normal"` and `"italic"`.
     *
     * **Default value:** `"normal"`
     */
    labelFontStyle?: FontStyle;

    /**
     * The font weight. The following strings and numbers are valid values:
     * `"thin"` (`100`), `"light"` (`300`), `"regular"` (`400`),
     * `"normal"` (`400`), `"medium"` (`500`), `"bold"` (`700`),
     * `"black"` (`900`)
     *
     * **Default value:** `"regular"`
     */
    labelFontWeight?: FontWeight;

    /**
     * The font size in pixels.
     *
     * **Default value:** `11`
     */
    labelFontSize?: number;

    /**
     * The horizontal alignment of the text. One of `"left"`, `"center"`, or `"right"`.
     *
     * **Default value:** `"left"`
     */
    labelAlign?: Align;

    /**
     * Default size (width) of the metadata attribute columns.
     * Can be configured per attribute using the `attributes` property.
     *
     * **Default value:** `10`
     */
    attributeSize?: number;

    /**
     * The font typeface. GenomeSpy uses [SDF](https://github.com/Chlumsky/msdfgen)
     * versions of [Google Fonts](https://fonts.google.com/). Check their
     * availability at the [A-Frame
     * Fonts](https://github.com/etiennepinchon/aframe-fonts/tree/master/fonts)
     * repository. System fonts are **not** supported.
     *
     * **Default value:** `"Lato"`
     */
    attributeLabelFont?: string;

    /**
     * The font style. Valid values: `"normal"` and `"italic"`.
     *
     * **Default value:** `"normal"`
     */
    attributeLabelFontStyle?: FontStyle;

    /**
     * The font weight. The following strings and numbers are valid values:
     * `"thin"` (`100`), `"light"` (`300`), `"regular"` (`400`),
     * `"normal"` (`400`), `"medium"` (`500`), `"bold"` (`700`),
     * `"black"` (`900`)
     *
     * **Default value:** `"regular"`
     */
    attributeLabelFontWeight?: FontWeight;

    /**
     * The font size in pixels.
     *
     * **Default value:** `11`
     */
    attributeLabelFontSize?: number;

    /**
     * Angle to be added to the default label angle (-90).
     *
     * **Default value:** `0`
     */
    attributeLabelAngle?: number;

    /**
     * Spacing between attribute columns in pixels.
     *
     * **Default value:** `1`
     */
    attributeSpacing?: number;
}
