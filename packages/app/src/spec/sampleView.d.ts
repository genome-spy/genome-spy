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
     * Data source used to resolve sample identifiers.
     */
    data: Data;

    /**
     * Field containing the sample id.
     *
     * **Default value:** `"sample"`
     */
    idField?: string;

    /**
     * Field containing a user-visible sample label.
     * If omitted, sample ids are used.
     */
    displayNameField?: string;
}

export interface ColumnIdentifierField {
    /**
     * Identifier field name for UI and diagnostics.
     */
    name: string;

    /**
     * Backend path that provides identifier values.
     */
    path: string;

    /**
     * Whether this is the primary identifier field.
     */
    primary?: boolean;

    /**
     * Use case-insensitive matching for this identifier field.
     */
    caseInsensitive?: boolean;

    /**
     * Remove version suffixes during matching (for example, ENSG...`.12`).
     */
    stripVersionSuffix?: boolean;
}

export interface ColumnSynonymIndex {
    /**
     * Backend path containing synonym terms.
     */
    termPath: string;

    /**
     * Backend path containing resolved column indices for terms.
     */
    columnIndexPath: string;

    /**
     * Optional backend path describing synonym provenance.
     */
    sourcePath?: string;
}

export interface DataBackendDef {
    backend: "data";

    /**
     * Eager tabular data source using the standard data contract.
     */
    data: UrlData | InlineData;

    /**
     * Field name in the table that matches sample ids.
     *
     * **Default value:** `"sample"`
     */
    sampleIdField?: string;
}

export interface ZarrBackendDef {
    backend: "zarr";

    /**
     * URL to the Zarr store.
     */
    url: string;

    /**
     * Layout style used by the source.
     */
    layout: "matrix" | "table";

    /**
     * Matrix layout configuration.
     */
    matrix?: {
        /**
         * Path to matrix values.
         *
         * **Default value:** `"X"`
         */
        valuesPath?: string;

        /**
         * Path to row identifiers.
         *
         * **Default value:** `"obs_names"`
         */
        rowIdsPath?: string;

        /**
         * Path to column identifiers.
         *
         * **Default value:** `"var_names"`
         */
        columnIdsPath?: string;
    };

    /**
     * Table layout configuration.
     */
    table?: {
        /**
         * Path to the table-like array/group.
         */
        path?: string;

        /**
         * Field containing sample ids.
         */
        sampleIdField?: string;
    };

    /**
     * Optional identifier fields for resolving user queries to columns.
     */
    identifiers?: ColumnIdentifierField[];

    /**
     * Optional synonym index for query expansion.
     */
    synonymIndex?: ColumnSynonymIndex;
}

export interface ParquetBackendDef {
    backend: "parquet";

    /**
     * URL to a Parquet data source.
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
     * Stable identifier used in actions and provenance entries.
     */
    id?: string;

    /**
     * Optional label shown to users.
     * If omitted, UI falls back to `id`.
     */
    name?: string;

    /**
     * Optional concise context for users and automation.
     */
    description?: string;

    /**
     * Startup loading behavior.
     * Omitted value uses backend defaults.
     */
    initialLoad?: false | "*" | string[];

    /**
     * Column ids that must never be imported from this source.
     */
    excludeColumns?: string[];

    /**
     * Default metadata group path for imported attributes.
     */
    groupPath?: string;

    /**
     * Separator for source-side attribute hierarchy.
     */
    attributeGroupSeparator?: string;

    /**
     * Default attribute definition for imported columns.
     */
    defaultAttributeDef?: SampleAttributeDef;

    /**
     * Per-column attribute definitions.
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
     * Metadata source definitions used for eager and on-demand imports.
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
