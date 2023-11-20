import {
    ScaleBand,
    ScaleIdentity,
    ScaleLinear,
    ScaleLogarithmic,
    ScaleOrdinal,
    ScalePoint,
    ScalePower,
    ScaleQuantile,
    ScaleQuantize,
    ScaleSequential,
    ScaleSymLog,
    ScaleThreshold,
    ScaleTime,
    ScaleDiverging,
    ScaleContinuousNumeric,
} from "d3-scale";
import { ChannelDef } from "../spec/channel.js";
import { ScaleLocus } from "../genome/scaleLocus.js";
import { ScaleIndex } from "../genome/scaleIndex.js";
import { Scalar } from "../spec/channel.js";

export interface AccessorMetadata {
    /** True if the accessor returns the same value for all objects */
    constant: boolean;

    /** The fields that the return value is based on (if any) */
    fields: string[];
}

export type Accessor = ((datum: any) => any) & AccessorMetadata;

export interface EncoderMetadata {
    /** True if the accessor returns the same value for all objects */
    constant: boolean;

    /** True the encoder returns a "value" without a scale */
    constantValue: boolean;

    invert: (value: Scalar) => Scalar;

    scale?: VegaScale;

    accessor: Accessor;

    /** Converts ordinal values to index numbers */
    indexer?: (value: any) => number;

    channelDef: ChannelDef;

    /** Copies metadata to the target function */
    applyMetadata: (target: Function) => void;
}

export type Encoder = ((datum: object) => Scalar) & EncoderMetadata;

export type NumberEncoder = ((datum: object) => number) & EncoderMetadata;

export interface ScaleMetadata {
    /** Scale type */
    type: string;

    /** Whether to use emulated 64 bit floating point in WebGL */
    fp64?: boolean;
}

export type D3Scale =
    | ScaleContinuousNumeric<any, any>
    | ScaleLinear<any, any>
    | ScalePower<any, any>
    | ScaleLogarithmic<any, any>
    | ScaleSymLog<any, any>
    | ScaleIdentity
    | ScaleTime<any, any>
    | ScaleSequential<any>
    | ScaleDiverging<any>
    | ScaleQuantize<any>
    | ScaleQuantile<any>
    | ScaleThreshold<any, any>
    | ScaleOrdinal<any, any>
    | ScaleBand<any>
    | ScalePoint<any>;

export type VegaScale = (D3Scale | ScaleIndex | ScaleLocus) & ScaleMetadata;
