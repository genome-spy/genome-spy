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
    constant?: Scalar;
    scale?: Scale;
    axis?: Axis;
    title?: string;
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
}

export interface LayerSpec extends ViewSpecBase {
    layer: ViewSpec[];
    resolve?: object;
}

export type ContainerSpec = LayerSpec;

export interface UnitSpec extends ViewSpecBase {
    mark: string | MarkConfig;
}

export type ViewSpec = UnitSpec | LayerSpec;

export interface ImportConfig {
    name?: string;
    url?: string;
    params?: object;
}

export interface ImportSpec {
    import: ImportConfig;
}

export interface TrackSpec {
    tracks?: (ViewSpec | ImportSpec)[];
    baseUrl?: string;
}

export interface RootConfig {
    genome?: GenomeConfig;
    baseUrl?: string;
}

export type RootSpec = (ViewSpec | TrackSpec) & RootConfig;
