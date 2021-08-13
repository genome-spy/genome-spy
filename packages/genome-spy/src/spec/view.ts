import { Data } from "./data";
import { Scale } from "./scale";
import { TransformParams } from "./transform";
import { GenomeConfig } from "../genome/genome";
import { SizeDef } from "../utils/layout/flexLayout";
import { Encoding, FacetFieldDef, PositionalChannel } from "./channel";
import { Tooltip } from "./tooltip";

// TODO: Perhaps this should be in "utils"
export type GeometricDimension = "width" | "height";
export interface MarkConfig {
    type: string;
    /** Whether the mark should be clipped to the UnitView's rectangle.  */
    clip?: boolean;
    align?: string;
    baseline?: string;
    dx?: number;
    dy?: number;
    xOffset?: number;
    yOffset?: number;
    tooltip?: Tooltip;

    dynamicData?: boolean;

    /**
     * Minimum size for WebGL buffers (number of data items).
     * Allows for using bufferSubData to update graphics.
     * This property is intended for internal usage.
     */
    minBufferSize?: number;

    /**
     * Builds and index for efficient rendering of subsets of the data.
     * The data must be sorted by the x coordinate.
     *
     * TODO: This should be enabled automatically if the data are sorted.
     */
    buildIndex?: boolean;
}

export interface FacetMapping {
    column?: FacetFieldDef;
    row?: FacetFieldDef;
}

/**
 * DynamicOpacity specifies a zoom-dependent behavior for view opacity.
 * The opacity is interpolated between the specified stops.
 */
export interface DynamicOpacity {
    channel?: PositionalChannel;
    /** Stops expressed as units (base pairs, for example) per pixel. */
    unitsPerPixel: number[];
    /** Opacity values that match the given stops. */
    values: number[];
}

export type ViewOpacityDef = number | DynamicOpacity;

export interface ViewSpecBase extends ResolveSpec {
    name?: string;

    height?: SizeDef | number | "container";
    width?: SizeDef | number | "container";
    /** Padding in pixels. Default: 0 */
    padding?: number;

    data?: Data;
    transform?: TransformParams[];
    encoding?: Encoding;
    title?: string;

    /**
     * A description of the view. Multiple lines can be provided as an array.
     */
    description?: string | string[];

    baseUrl?: string;

    /**
     * Opacity of the view and all its children. Default: `1.0`.
     * TODO: Should be available only in Unit and Layer views.
     */
    opacity?: ViewOpacityDef;
}

export interface AggregateSamplesSpec {
    // TODO: Introduce a type (UnitSpec | LayerSpec) that can ba used in SampleView and here
    aggregateSamples?: (UnitSpec | LayerSpec)[];
}
export interface TableRowSpec extends ViewSpecBase {
    center: ViewSpec;
    left?: ViewSpec;
    right?: ViewSpec;
}

export interface TableSpec extends ViewSpecBase {
    table: TableRowSpec[];
}

export interface LayerSpec extends ViewSpecBase, AggregateSamplesSpec {
    layer: (LayerSpec | UnitSpec)[];
}

export interface FacetSpec extends ViewSpecBase {
    facet: FacetFieldDef | FacetMapping;
    spec: LayerSpec | UnitSpec;
    columns?: number;
    spacing?: number;
}

export interface SampleAttributeDef {
    type: string;
    /** Color scale (primary) */
    scale?: Scale;
    barScale?: Scale;
    width?: number;
}

export interface SampleDef {
    data?: Data;
    attributes?: Record<string, SampleAttributeDef>;
}

export interface SampleSpec extends ViewSpecBase {
    samples: SampleDef;
    spec: LayerSpec | UnitSpec;

    stickySummaries?: boolean;
}

export interface UnitSpec extends ViewSpecBase, AggregateSamplesSpec {
    mark: string | MarkConfig;
}

export type ResolutionTarget = "scale" | "axis";

/**
 * `"independent"` and `"shared"` behave similarly to Vega-Lite.
 * `"excluded"` behaves like `"shared"`, but is not pulled towards the root.
 */
export type ResolutionBehavior = "independent" | "shared" | "excluded";
export interface ResolveSpec {
    resolve?: Partial<
        Record<ResolutionTarget, Record<string, ResolutionBehavior>>
    >;
}

export type ContainerSpec = (
    | LayerSpec
    | FacetSpec
    | SampleSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec
    | TableSpec
    | TableRowSpec
    | UnitSpec
) &
    ResolveSpec;

export type ViewSpec =
    | UnitSpec
    | LayerSpec
    | FacetSpec
    | SampleSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec
    | TableSpec
    | TableRowSpec;

export interface ImportConfig {
    name?: string;
    url?: string;
    params?: object;
}

export interface ImportSpec {
    import: ImportConfig;
}

export interface ConcatBase extends ViewSpecBase {
    spacing?: number;
}

export interface VConcatSpec extends ConcatBase {
    vconcat: (ViewSpec | ImportSpec)[];
}

export interface HConcatSpec extends ConcatBase {
    hconcat: (ViewSpec | ImportSpec)[];
}

export interface ConcatSpec extends ConcatBase {
    concat: (ViewSpec | ImportSpec)[];
}

export interface RootConfig {
    genome?: GenomeConfig;

    /**
     * A unique identifier that is used in storing state bookmarks to browser's
     * IndexedDB. This is needed to make distinction between visualizations that
     * are served from the same origin, i.e., the same host and port.
     */
    specId?: string;

    baseUrl?: string;

    /**
     * https://vega.github.io/vega-lite/docs/data.html#datasets
     */
    datasets?: Record<string, any[]>;
}

export type RootSpec = ViewSpec & RootConfig;
