import { Scale } from "./scale";
import { Axis } from "./axis";

export type Scalar = string | number | boolean;
export type FieldName = string;

export type PositionalChannel = "x" | "y";

export interface ChannelDefBase {
    title?: string;
}

export interface ChannelDefWithScale extends ChannelDefBase {
    type: string;

    /**
     * Offset within a band of a band scale, [0, 1]
     *
     * TODO: rename to bandPosition: https://github.com/vega/vega-lite/pull/7190
     */
    band?: number;

    scale?: Scale;
    axis?: Axis;

    format?: string;

    /** Use emulated 64 bit floating points to increase GPU rendering precision */
    fp64?: boolean;
}

export interface FieldDef extends ChannelDefWithScale {
    field: FieldName;
}

export interface DatumDef extends ChannelDefWithScale {
    /** A constant value on the data domain */
    datum: Scalar;
}

export interface ValueDef extends ChannelDefBase {
    /** A constant value in the context of the range */
    value: Scalar;
}

export interface ExprDef extends ChannelDefBase {
    /** An expression. Properties of the data can be accessed through the `datum` object. */
    expr: string;
}
export interface ChromPosDef extends ChannelDefBase {
    chrom: FieldName;
    pos?: FieldName;
}

export type ChannelDef = FieldDef | DatumDef | ValueDef | ExprDef | ChromPosDef;

export type Encoding = Record<string, ChannelDef>;
