import { Data, InlineData, UrlData } from "@genome-spy/core/spec/data.js";
import { Align, FontStyle, FontWeight } from "@genome-spy/core/spec/font.js";
import { Scale } from "@genome-spy/core/spec/scale.js";
import { ViewSpecBase, ViewBackground } from "@genome-spy/core/spec/view.js";
import {
    AppConfigurableVisibilitySpec,
    AppLayerSpec,
    AppNestedViewSpec,
    AppUnitSpec,
} from "./view.js";

/**
 * A view specification for a SampleView.
 */
export interface SampleSpec extends Omit<ViewSpecBase, "templates"> {
    /**
     * Is the SampleView visibility configurable from the GenomeSpy App toolbar.
     *
     * __Default value:__ `true`
     */
    configurableVisibility?: AppConfigurableVisibilitySpec["configurableVisibility"];

    /**
     * Sample identity and label configuration.
     *
     * If `identity` is omitted, sample identifiers are inferred from the data.
     */
    samples: SampleDef;

    /**
     * Metadata sources and metadata matrix layout.
     */
    metadata?: MetadataDef;

    /**
     * Layout settings for sample rows and sample groups.
     */
    sampleLayout?: SampleLayoutDef;

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

    /**
     * Keep summary tracks visible while scrolling samples.
     *
     * __Default value:__ `true`
     */
    stickySummaries?: boolean;
}

export type SampleAttributeType = "nominal" | "ordinal" | "quantitative";

export type SampleAttributeSemanticType =
    | "subjectId"
    | "modelSystemId"
    | "timeToEvent"
    | "eventStatus"
    | "category";

export interface SampleAttributeDef {
    /**
     * User-facing description of the metadata attribute.
     */
    description?: string;

    /**
     * The attribute type. One of `"nominal"`, `"ordinal"`, or `"quantitative"`.
     */
    type?: SampleAttributeType;

    /**
     * Domain-specific meaning of the metadata attribute.
     */
    semanticType?: SampleAttributeSemanticType;

    /**
     * Color scale for metadata cells.
     */
    scale?: Scale;

    /**
     * Scale for mapping quantitative values to metadata cell width.
     */
    barScale?: Scale;

    /**
     * Color used for metadata cells whose value is missing.
     *
     * If `null`, no background is drawn for missing values in this attribute.
     * If omitted, `metadata.missingValueColor` is used. If both are
     * omitted, the default is `null` when `barScale` is configured and
     * `"#f0f0f0"` otherwise.
     */
    missingValueColor?: string | null;

    /**
     * Width of the column in pixels.
     */
    width?: number;

    /**
     * Whether the attribute is visible when the view opens.
     */
    visible?: boolean;

    /**
     * Attribute label shown in the metadata header.
     *
     * If omitted, the attribute name is used.
     */
    title?: string;
}

export interface SampleIdentityDef {
    /**
     * Data source that defines the sample set for the view.
     *
     * The source must contain one row per sample. Metadata imports are matched
     * against these sample ids.
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
     * Name of the identifier field shown in UI and diagnostics.
     *
     * Example values: `"symbol"`, `"ensembl"`, `"entrez"`.
     */
    name: string;

    /**
     * Backend path to identifier values aligned to matrix columns.
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

export interface DataBackendDef {
    backend: "data";

    /**
     * Eager tabular metadata source.
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
     * Path to matrix values, arranged as sample rows by metadata columns.
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

export interface ZarrBackendDef {
    backend: "zarr";

    /**
     * URL to the root of the Zarr store.
     */
    url: string;

    /**
     * Path overrides for the matrix layout.
     */
    matrix?: ZarrMatrixLayoutDef;

    /**
     * Identifier arrays used to resolve user queries to columns.
     *
     * If omitted, only primary column ids are used for lookup.
     */
    identifiers?: ColumnIdentifierField[];
}

export interface ParquetBackendDef {
    backend: "parquet";

    /**
     * URL to a Parquet metadata source.
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
     * URL to an Arrow metadata source.
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
     * Stable source identifier.
     *
     * Should remain stable across spec revisions if bookmarks/provenance replay
     * must keep working.
     */
    id?: string;

    /**
     * User-facing label shown in menus and dialogs.
     *
     * If omitted, UI falls back to `id`.
     */
    name?: string;

    /**
     * User-facing description of what this source contains.
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
     * If omitted, data backends load all columns and other backends do not
     * load columns at startup.
     */
    initialLoad?: false | "*" | string[];

    /**
     * Column ids that must never be imported from this source.
     *
     * The data backend always excludes its `sampleIdField` automatically, so
     * this property is only needed for other helper columns such as display
     * labels.
     */
    excludeColumns?: string[];

    /**
     * Default destination group path for imported attributes.
     *
     * Imported column names are placed under this path, which effectively
     * creates (or reuses) a metadata hierarchy node.
     *
     * This value is parsed as a path using `attributeGroupSeparator` when that
     * separator is defined for the source. Without an explicit separator, the
     * whole value is treated as one group name (including any `/` characters).
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
     * Attribute definitions keyed by attribute/column id (and optionally by group path).
     *
     * Special key `""` defines source-level defaults for all imported columns.
     * Path splitting is applied only when `attributeGroupSeparator` is defined.
     */
    attributes?: Record<string, SampleAttributeDef>;

    /**
     * Source backend configuration.
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

export interface MetadataDef {
    /**
     * Metadata source definitions used for startup and on-demand imports.
     *
     * Source order is significant for startup loading: eager startup imports
     * are applied in declaration order.
     */
    sources?: MetadataSourceEntry[];

    /**
     * Default width of metadata columns in pixels.
     *
     * __Default value:__ `10`
     */
    attributeWidth?: number;

    /**
     * Default color for metadata cells whose value is missing.
     *
     * If `null`, missing-value colors are disabled unless overridden by an
     * attribute definition.
     *
     * __Default value:__ `"#f0f0f0"`
     */
    missingValueColor?: string | null;

    /**
     * Spacing between metadata columns in pixels.
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

export interface SampleDef {
    /**
     * Defines the sample ids and optional display names for the sample view.
     *
     * If omitted, sample ids are inferred from the `sample` channel in the view
     * data.
     */
    identity?: SampleIdentityDef;

    /**
     * Title shown above sample labels.
     * If omitted, the title defaults to `"Sample"`.
     * Set to `null` to hide the title.
     */
    labelTitle?: string | null;

    /**
     * Width reserved for sample labels in pixels.
     *
     * If omitted, the width is inferred from the sample labels.
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
}

export interface SampleLayoutDef {
    /**
     * Height of one sample row when the view is expanded for (close-up) inspection.
     * In the birdseye overview, sample rows are automatically scaled to fit the available vertical space.
     *
     * __Default value:__ `35`
     */
    sampleHeight?: number;

    /**
     * Spacing between sample groups in the fitted layout.
     *
     * __Default value:__ `5`
     */
    groupSpacing?: number;

    /**
     * Spacing between sample groups in the expanded layout.
     *
     * __Default value:__ `15`
     */
    peekGroupSpacing?: number;

    /**
     * Fraction of each sample row reserved as spacing between rendered sample contents.
     *
     * Spacing is reduced when rows are too short to render cleanly.
     *
     * __Default value:__ `0.2`
     */
    sampleSpacingFactor?: number;
}
