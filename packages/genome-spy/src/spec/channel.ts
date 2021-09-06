import { Scale } from "./scale";
import { Axis } from "./axis";

export type Scalar = string | number | boolean;
export type FieldName = string;

export type PositionalChannel = "x" | "y";

export type SecondaryPositionalChannel = "x2" | "y2";

export type Channel =
    | PositionalChannel
    | SecondaryPositionalChannel
    | "color"
    | "fill"
    | "stroke"
    | "opacity"
    | "fillOpacity"
    | "strokeOpacity"
    | "size"
    | "shape"
    | "text"
    | "size2"
    | "color2";

export interface ChannelDefBase {
    title?: string | null;
}

export interface ValueDef extends ChannelDefBase {
    /** A constant value in the context of the range */
    value: Scalar;
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
    axis?: Axis | null;

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

export interface ExprDef extends ChannelDefWithScale {
    /** An expression. Properties of the data can be accessed through the `datum` object. */
    expr: string;
}
export interface ChromPosDef extends ChannelDefWithScale {
    type: "locus";
    chrom: FieldName;
    pos?: FieldName;
}

export interface FacetFieldDef extends ChannelDefBase {
    field: FieldName;
    spacing?: number;
}

export type ChannelDef =
    | FieldDef
    | DatumDef
    | ValueDef
    | ExprDef
    | ChromPosDef
    | FacetFieldDef;

export type Encoding = Partial<Record<Channel, ChannelDef | null>>;
