import { Data } from "./data";
import { Scale } from "./scale";
import { Axis } from "./axis";
import { TransformConfig } from "./transform";
import { GenomeConfig } from "../genome/genome";
import { SizeDef } from "../utils/flexLayout";

export type Scalar = string | number | boolean;

export type FieldName = string;

export interface MarkConfig {
    type: string;
    align?: string;
    baseline?: string;
    dx?: number;
    dy?: number;
    xOffset?: number;
    yOffset?: number;
    tooltip?: object;
    sorting?: object;
}

// TODO: Create an interface for values (they don't have type or anything else)
export interface EncodingConfig {
    type?: string;
    field?: FieldName;

    /** A constant value in the context of the range */
    value?: Scalar;

    /** An expression. Properties of the data can be accessed throught the `datum` object. */
    expr?: string;

    /** A constant value on the data domain */
    datum?: Scalar;

    scale?: Scale;
    axis?: Axis;
    title?: string;
    format?: string;
}

export type EncodingConfigs = Record<string, EncodingConfig>;

export interface ViewSpecBase {
    name?: string;
    height?: SizeDef | number;
    data?: Data;
    transform?: TransformConfig[];
    encoding?: Record<string, EncodingConfig>;
    title?: string;
    description?: string;
    baseUrl?: string;

    /**
     * Background color of the plotting area. The property has effect only on
     * the immediate non-concat children of concat views or in the single root view.
     * In practice, the property can be used to define background colors for "tracks".
     * TODO: Use view background instead: https://vega.github.io/vega-lite/docs/spec.html#view-background
     */
    plotBackground?: string;
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

export type ContainerSpec = (
    | LayerSpec
    | VConcatSpec
    | HConcatSpec
    | TableSpec
    | TableRowSpec
) & {
    resolve?: {
        scale: Record<string, "independent" | "shared">;
    };
};

export interface UnitSpec extends ViewSpecBase {
    mark: string | MarkConfig;
}

export type ViewSpec =
    | UnitSpec
    | LayerSpec
    | VConcatSpec
    | HConcatSpec
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

export interface VConcatSpec extends ViewSpecBase {
    // TODO: vconcat
    concat?: (ViewSpec | ImportSpec)[];
}

export interface HConcatSpec extends ViewSpecBase {
    hconcat?: (ViewSpec | ImportSpec)[];
}

export interface RootConfig {
    genome?: GenomeConfig;
    baseUrl?: string;
}

export type RootSpec = ViewSpec & RootConfig;
