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
import { Channel, ChannelDef, ChannelWithScale } from "../spec/channel.js";
import { ScaleLocus } from "../genome/scaleLocus.js";
import { ScaleIndex } from "../genome/scaleIndex.js";
import { Scalar } from "../spec/channel.js";
import { Datum } from "../data/flowNode.js";
import { ExprRefFunction } from "../view/paramMediator.js";

export interface Accessor<T = Scalar> {
    (datum: Datum): T;

    /**
     * @returns A new accessor that returns the same value as this accessor,
     * but typed as a number
     */
    asNumberAccessor(): Accessor<number>;

    /**
     * True if the accessor returns the same value for all objects
     */
    constant: boolean;

    /**
     * The fields that the return value is based on (if any)
     */
    fields: string[];

    /**
     * The channel that the accessor is based on
     */
    channel: Channel;

    /**
     * If the accessed data needs to be passed to a scale function
     * before visual encoding, indicates with channel has the scale.
     * If no scale is needed, this is undefined.
     */
    scaleChannel: ChannelWithScale;

    /**
     * The ChannelDef that the accessor is based on
     */
    channelDef: ChannelDef;
}

export interface PredicateAndAccessor<T = Scalar> {
    /**
     * Conditional accessor is used when the predicate is true
     */
    predicate: ExprRefFunction;

    /**
     * The parameter the predicate is based on
     */
    param: string;

    accessor: Accessor<T>;
}

export interface Encoder {
    (datum: Datum): Scalar;

    /** True if the accessor returns the same value for all objects */
    constant: boolean;

    /** True the encoder returns a "value" without a scale */
    constantValue: boolean;

    invert(value: Scalar): Scalar;

    /** Scale, if the encoder has one */
    scale?: VegaScale;

    accessor: Accessor;

    /** Converts ordinal values to index numbers */
    indexer?: (value: Scalar) => number;

    channelDef: ChannelDef;
}

export interface ScaleMetadata {
    /** Scale type */
    type: string;

    /** Whether to use emulated 64 bit floating point in WebGL */
    fp64?: boolean;
}

export type D3Scale =
    | ScaleContinuousNumeric<any, any, any>
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

export type GenericScale = any;

export type VegaScale = (D3Scale | ScaleIndex | ScaleLocus) & ScaleMetadata;
