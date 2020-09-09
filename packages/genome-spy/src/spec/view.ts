import { Data } from "./data";
import { Scale } from "./scale";
import { Axis } from "./axis";
import { TransformConfig } from "./transform";
import { GenomeConfig } from "../genome/genome";

export type Scalar = string | number | boolean;

export type FieldName = string;

export interface MarkConfig {
    type: string;
    tooltip?: object;
    sorting?: object;
}

export interface EncodingConfig {
    type: string;
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
     */
    plotBackground?: string;
}

export interface LayerSpec extends ViewSpecBase {
    layer: (LayerSpec | UnitSpec)[];
}

export type ContainerSpec = (LayerSpec | ConcatSpec) & {
    resolve?: {
        scale: Record<string, "independent" | "shared">;
    };
};

export interface UnitSpec extends ViewSpecBase {
    mark: string | MarkConfig;
}

export type ViewSpec = UnitSpec | LayerSpec | ConcatSpec;

export interface ImportConfig {
    name?: string;
    url?: string;
    params?: object;
}

export interface ImportSpec {
    import: ImportConfig;
}

export interface ConcatSpec extends ViewSpecBase {
    concat?: (ViewSpec | ImportSpec)[];
}

export interface RootConfig {
    genome?: GenomeConfig;
    baseUrl?: string;
}

export type RootSpec = ViewSpec & RootConfig;
