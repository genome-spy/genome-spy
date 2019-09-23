import { Data } from "./data";
import { Scale } from "./scale";
import { Axis } from "./axis";

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
    constant?: Scalar;
    scale?: Scale;
    axis?: Axis;
    title?: string
}

export type EncodingConfigs = Record<string, EncodingConfig>;

export interface ViewSpec {
    name?: string;
    data?: Data;
    transform?: object[];
    encoding?: Record<string, EncodingConfig>;
    title?: string;
    description?: string;
}

export interface LayerSpec extends ViewSpec {
    layer: ViewSpec[];
    resolve?: object;
}

export type ContainerSpec = LayerSpec;

export interface UnitSpec extends ViewSpec {
    mark: string | MarkConfig;
}

export interface TransformConfig {
    type: string;
}
