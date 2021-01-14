import { Data } from "./data";
import { Scale } from "./scale";
import { Axis } from "./axis";
import { TransformParams } from "./transform";
import { GenomeConfig } from "../genome/genome";
import { SizeDef } from "../utils/layout/flexLayout";

export type Scalar = string | number | boolean;

export type FieldName = string;

export type PositionalChannel = "x" | "y";

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
    tooltip?: object;

    dynamicData?: boolean;

    /**
     * Minimum size for WebGL buffers (number of data items).
     * Allows for using bufferSubData to update graphics.
     * This property is intended for internal usage.
     */
    minBufferSize?: number;
}

// TODO: Create an interface for values (they don't have type or anything else)
export interface ChannelDef {
    type?: string;
    field?: FieldName;

    /** A constant value in the context of the range */
    value?: Scalar;

    /** An expression. Properties of the data can be accessed through the `datum` object. */
    expr?: string;

    /** A constant value on the data domain */
    datum?: Scalar;

    /** Offset within a band of a band scale, [0, 1] */
    band?: number;

    scale?: Scale;
    axis?: Axis;
    title?: string;
    format?: string;

    /** Use emulated 64 bit floating points to increase GPU rendering precision */
    fp64?: boolean;
}

export interface FacetFieldDef {
    field: string;
    type: string;
    spacing?: number;
}

export interface FacetMapping {
    column?: FacetFieldDef;
    row?: FacetFieldDef;
}

export type Encoding = Record<string, ChannelDef>;

/**
 * DynamicOpacity specifies a zoom-dependent behavior for view opacity.
 * The opacity is interpolated between the specified stops.
 */
export interface DynamicOpacity {
    channel?: "x" | "y";
    /** Stops expressed as units (base pairs, for example) per pixel. */
    unitsPerPixel: number[];
    /** Opacity values that match the given stops. */
    values: number[];
}

export type ViewOpacityDef = number | DynamicOpacity;

export interface ViewSpecBase {
    name?: string;

    height?: SizeDef | number | "container";
    width?: SizeDef | number | "container";
    /** Padding in pixels. Default: 0 */
    padding?: number;

    data?: Data;
    transform?: TransformParams[];
    encoding?: Record<string, ChannelDef>;
    title?: string;
    description?: string;
    baseUrl?: string;

    /**
     * Opacity of the view and all its children. Default: `1.0`.
     * TODO: Should be available only in Unit and Layer views.
     */
    opacity?: ViewOpacityDef;
}

export interface TableRowSpec extends ViewSpecBase {
    center: ViewSpec;
    left?: ViewSpec;
    right?: ViewSpec;
}

export interface TableSpec extends ViewSpecBase {
    table: TableRowSpec[];
}

export interface LayerSpec extends ViewSpecBase {
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
    colorScale?: Scale;
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
) & {
    resolve?: {
        scale: Record<string, "independent" | "shared">;
        axis: Record<string, "independent" | "shared">;
    };
};

export interface UnitSpec extends ViewSpecBase {
    mark: string | MarkConfig;
}

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
    baseUrl?: string;
}

export type RootSpec = ViewSpec & RootConfig;
