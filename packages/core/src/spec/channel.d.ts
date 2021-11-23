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
    | "strokeWidth"
    | "size"
    | "shape"
    | "text"
    | "size2"
    | "color2"
    | "angle"
    | "sample"
    | "uniqueId"
    | "search"
    | "facetIndex"
    | "semanticScore"
    | "dx"
    | "dy";

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

    /**
     * Use emulated 64 bit floating points to increase precision of scales
     * computed on the GPU. By default, 32 bit floats are used.
     */
    fp64?: boolean;

    /**
     * Use an alternative channel for scale resolution.
     *
     * This is mainly for internal use and allows using `color` channel to resolve
     * `fill` and `stroke` channels under certain circumstances.
     */
    resolutionChannel?: Channel;
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

    /**
     * The field having the chromosome or contig.
     */
    chrom: FieldName;

    /**
     * The field having an intra-chromosomal position.
     */
    pos?: FieldName;

    /**
     * An offset or offsets that allow for adjusting the numbering base. The offset
     * is subtracted from the positions.
     *
     * GenomeSpy uses internally zero-based indexing with half-open intervals.
     * UCSC-based formats (BED, etc.) generally use this scheme. However, for example,
     * VCF files use one-based indexing and must be adjusted by setting the offset to
     * `1`.
     *
     * **Default:** `0`
     */
    offset?: number;
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
