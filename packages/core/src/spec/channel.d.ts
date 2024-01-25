/*!
 * Partially based on
 * https://github.com/vega/vega-lite/blob/master/src/channeldef.ts
 *
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 *
 * BSD-3-Clause License: https://github.com/vega/vega-lite/blob/master/LICENSE
 */

import { ExprRef } from "./parameter.js";
import { Scale } from "./scale.js";
import { GenomeAxis } from "./axis.js";

export type Scalar = string | number | boolean;
export type Value = Scalar | ExprRef | null;

export type FieldName = string;
export type Field = FieldName;

export type PrimaryPositionalChannel = "x" | "y";
export type SecondaryPositionalChannel = "x2" | "y2";

export type PositionalChannel =
    | PrimaryPositionalChannel
    | SecondaryPositionalChannel;

// Remember to updata the type guard when adding channels!
export type ChannelWithScale =
    | PositionalChannel
    | "color"
    | "fill"
    | "stroke"
    | "opacity"
    | "fillOpacity"
    | "strokeOpacity"
    | "strokeWidth"
    | "size"
    | "shape"
    | "angle"
    | "dx"
    | "dy"
    | "sample"; // Needed for collecting sample ids (domain) from multiple views

export type ChannelWithoutScale =
    | "uniqueId"
    | "search"
    | "text"
    | "facetIndex"
    | "semanticScore"
    | "uniqueId";

export type Channel = ChannelWithScale | ChannelWithoutScale;

// TODO
export type FacetFieldDef = any;

// TODO: Belongs to "guide"
export interface TitleMixins {
    /**
     * A title for the field. If `null`, the title will be removed.
     */
    title?: string | null;
}

export interface BandMixins {
    /**
     * Relative position on band scale. For example, the marks will be positioned at the beginning of the band if set to `0`, and at the middle of the band if set to `0.5`.
     *
     * @minimum 0
     * @maximum 1
     */
    // TODO: rename to bandPosition: https://github.com/vega/vega-lite/pull/7190
    // bandPosition?: number;
    band?: number;
}

export interface FormatMixins {
    /**
     * When used with the default `"number"` format type, the text formatting pattern for labels of guides (axes, legends, headers) and text marks.
     *
     * - If the format type is `"number"` (e.g., for quantitative fields), this is D3's [number format pattern](https://github.com/d3/d3-format#locale_format).
     *
     * See the [format documentation](https://vega.github.io/vega-lite/docs/format.html) for more examples.
     */
    format?: string;
}

export type StringDatumDef = DatumDef & FormatMixins;

export type Type = "quantitative" | "ordinal" | "nominal" | "index" | "locus";

export type TypeForShape = "ordinal" | "nominal";

export interface TypeMixins<T extends Type> {
    type: T;
}

export interface FieldDefBase<F> {
    /**
     * __Required.__ A string defining the name of the field from which to pull a data value
     * or an object defining iterated values from the [`repeat`](https://vega.github.io/vega-lite/docs/repeat.html) operator.
     *
     * __See also:__ [`field`](https://vega.github.io/vega-lite/docs/field.html) documentation.
     *
     * __Notes:__
     * 1)  Dots (`.`) and brackets (`[` and `]`) can be used to access nested objects (e.g., `"field": "foo.bar"` and `"field": "foo['bar']"`).
     * If field names contain dots or brackets but are not nested, you can use `\\` to escape dots and brackets (e.g., `"a\\.b"` and `"a\\[0\\]"`).
     * See more details about escaping in the [field documentation](https://vega.github.io/vega-lite/docs/field.html).
     * 2) `field` is not required if `aggregate` is `count`.
     */
    field?: F;
}

export type TypedFieldDef<
    F extends Field,
    T extends Type = any
> = FieldDefBase<F> & TitleMixins & TypeMixins<T>;

export type ScaleFieldDef<F extends Field, T extends Type> = TypedFieldDef<
    F,
    T
> &
    ScaleMixins;

export type FieldDefWithoutScale<F extends Field> = FieldDefBase<F> &
    TitleMixins;

export interface ScaleMixins {
    /**
     * An object defining properties of the channel's scale, which is the function that transforms values in the data domain (numbers, dates, strings, etc) to visual values (pixels, colors, sizes) of the encoding channels.
     *
     * If `null`, the scale will be [disabled and the data value will be directly encoded](https://vega.github.io/vega-lite/docs/scale.html#disable).
     *
     * __Default value:__ If undefined, default [scale properties](https://vega.github.io/vega-lite/docs/scale.html) are applied.
     *
     * __See also:__ [`scale`](https://vega.github.io/vega-lite/docs/scale.html) documentation.
     */
    scale?: Scale | null;

    /**
     * An alternative channel for scale resolution.
     *
     * This is mainly for internal use and allows using `color` channel to resolve `fill` and `stroke` channels under certain circumstances.
     */
    resolutionChannel?: ChannelWithScale;
}

export interface ValueDefBase<V extends Value = Scalar> {
    /**
     * A constant value in visual domain (e.g., `"red"` / `"#0099ff"`, values between `0` to `1` for opacity).
     */
    value: V;
}

export type ValueDef<V extends Value = Scalar> = ValueDefBase<V> & TitleMixins;

/**
 * @internal
 */
export interface ValueExprDefBase {
    /**
     * An expression that evaluates as a value in visual domain (e.g., `"red"` / `"#0099ff"`, values between `0` to `1` for opacity).
     */
    valueExpr: string;
}

/**
 * @internal
 */
export type ValueExprDef = ValueExprDefBase & TitleMixins;

export interface DatumDefBase {
    /**
     * A constant value in data domain.
     */
    datum?: Scalar;
}

export type DatumDef = DatumDefBase & TitleMixins;

export interface ExprDef {
    /** An expression. Properties of the data can be accessed through the `datum` object. */
    expr: string;
}

/**
 * Field definition of a mark property, which can contain a legend.
 */
export type MarkPropFieldDef<
    F extends Field,
    T extends Type = Type
> = ScaleFieldDef<F, T> & LegendMixins;

export type MarkPropExprDef<T extends Type = Type> = ExprDef &
    TypeMixins<T> &
    ScaleMixins &
    TitleMixins;

export type MarkPropDatumDef<T extends Type> = LegendMixins &
    ScaleDatumDef &
    TypeMixins<T>;

export type MarkPropFieldOrDatumOrExprDef<
    F extends Field,
    T extends Type = Type
> = MarkPropFieldDef<F, T> | MarkPropDatumDef<T> | MarkPropExprDef;

export interface LegendMixins {
    /**
     * An object defining properties of the legend.
     * If `null`, the legend for the encoding channel will be removed.
     *
     * __Default value:__ If undefined, default [legend properties](https://vega.github.io/vega-lite/docs/legend.html) are applied.
     *
     * __See also:__ [`legend`](https://vega.github.io/vega-lite/docs/legend.html) documentation.
     */
    // TODO: legend?: Legend<ExprRef | SignalRef> | null;
}

export type MarkPropDef<
    F extends Field,
    V extends Value,
    T extends Type = Type
> = MarkPropFieldOrDatumOrExprDef<F, T> | ValueDef<V>;

export type ColorDef<F extends Field> = MarkPropDef<F, string | null>;

export type SecondaryFieldDef<F extends Field> = FieldDefBase<F> & TitleMixins;

export type NumericValueDef = ValueDef<number>;

export type ScaleDatumDef = ScaleMixins & DatumDef;

export type PositionDatumDefBase = ScaleDatumDef & TypeMixins<Type>;

export type PositionFieldDef<F extends Field> = PositionFieldDefBase<F> &
    PositionMixins;

export type PositionDatumDef = PositionDatumDefBase & PositionMixins;

export type PositionExprDef = ExprDef &
    PositionMixins &
    BandMixins &
    TypeMixins<Type>;

export type PositionValueDef = NumericValueDef;

export interface PositionMixins extends BandMixins {
    /**
     * An object defining properties of axis's gridlines, ticks and labels.
     * If `null`, the axis for the encoding channel will be removed.
     *
     * __Default value:__ If undefined, default [axis properties](https://vega.github.io/vega-lite/docs/axis.html) are applied.
     *
     * __See also:__ [`axis`](https://vega.github.io/vega-lite/docs/axis.html) documentation.
     */
    axis?: GenomeAxis | null;
}

export type PositionFieldDefBase<F extends Field> = ScaleFieldDef<F, Type>;

export interface ChromPosDefBase extends BandMixins {
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

export type SecondaryChromPosDef = ChromPosDefBase &
    TitleMixins &
    PositionMixins;

export type ChromPosDef = SecondaryChromPosDef &
    TypeMixins<"locus"> &
    ScaleMixins;

export type PositionDef<F extends Field> =
    | PositionFieldDef<F>
    | ChromPosDef
    | PositionDatumDef
    | PositionExprDef
    | PositionValueDef;

export type Position2Def<F extends Field> =
    | (SecondaryFieldDef<F> & BandMixins)
    | SecondaryChromPosDef
    | (DatumDef & BandMixins)
    | (ExprDef & BandMixins)
    | PositionValueDef;

export type NumericMarkPropDef<F extends Field> = MarkPropDef<F, number>;

export type ShapeDef<F extends Field> = MarkPropDef<
    F,
    string | null,
    TypeForShape
>;

export interface StringFieldDef<F extends Field>
    extends FieldDefWithoutScale<F>,
        FormatMixins {}

export type TextDef<F extends Field> =
    | StringFieldDef<F>
    | StringDatumDef
    | ExprDef;

export type ChannelDef<F extends Field = string> =
    Encoding<F>[keyof Encoding<F>];

// TODO: Does this make sense?
export type ChannelDefWithScale = ScaleMixins & TypeMixins<Type>;

export interface XIndexDef {
    /**
     * Builds and index for efficient rendering of subsets of the data. This
     * setting is useful when rendering large amounts of data and often
     * only a small subset of the data is visible. An example of such a
     * situation is a scatter plot spanning the whole genome.
     *
     * This setting implicitly sorts the data by the field assigned
     * on the `x` channel.
     */
    buildIndex?: boolean;
}

export interface Encoding<F extends Field = string> {
    /**
     * X coordinates of the marks.
     *
     * The `value` of this channel can be a number between zero and one.
     */
    x?: PositionDef<F> & XIndexDef;

    /**
     * Y coordinates of the marks.
     *
     * The `value` of this channel can be a number between zero and one.
     */
    y?: PositionDef<F>;

    /**
     * X2 coordinates of the marks.
     *
     * The `value` of this channel can be a number between zero and one.
     */
    x2?: Position2Def<F>;

    /**
     * Y2 coordinates of the marks.
     *
     * The `value` of this channel can be a number between zero and one.
     */
    y2?: Position2Def<F>;

    dx?: NumericMarkPropDef<F>;
    dy?: NumericMarkPropDef<F>;

    /**
     * Color of the marks – either fill or stroke color based on  the `filled` property of mark definition.
     *
     * _Note:_
     * 1) For fine-grained control over both fill and stroke colors of the marks, please use the `fill` and `stroke` channels. The `fill` or `stroke` encodings have higher precedence than `color`, thus may override the `color` encoding if conflicting encodings are specified.
     * 2) See the scale documentation for more information about customizing [color scheme](https://vega.github.io/vega-lite/docs/scale.html#scheme).
     */
    color?: ColorDef<F>;

    /**
     * Fill color of the marks.
     *
     * _Note:_ The `fill` encoding has higher precedence than `color`, thus may override the `color` encoding if conflicting encodings are specified.
     */
    fill?: ColorDef<F>;

    /**
     * Stroke color of the marks.
     *
     * _Note:_ The `stroke` encoding has higher precedence than `color`, thus may override the `color` encoding if conflicting encodings are specified.
     */

    stroke?: ColorDef<F>;

    /**
     * Opacity of the marks.
     */
    opacity?: NumericMarkPropDef<F>;

    /**
     * Fill opacity of the marks.
     */
    fillOpacity?: NumericMarkPropDef<F>;

    /**
     * Stroke opacity of the marks.
     */
    strokeOpacity?: NumericMarkPropDef<F>;

    /**
     * Stroke width of the marks.
     */
    strokeWidth?: NumericMarkPropDef<F>;

    /**
     * Size of the mark.
     * - For `"point"` – the symbol size, or pixel area of the mark.
     * - For `"text"` – the text's font size.
     */
    size?: NumericMarkPropDef<F>;

    /**
     * Rotation angle of point and text marks.
     */
    angle?: NumericMarkPropDef<F>;

    /**
     * Shape of the mark.
     *
     * For `point` marks the supported values include:
     * - plotting shapes: `"circle"`, `"square"`, `"cross"`, `"diamond"`, `"triangle-up"`, `"triangle-down"`, `"triangle-right"`, or `"triangle-left"`.
     * - centered directional shape `"triangle"`
     */
    shape?: ShapeDef<F>;

    /**
     * Text of the `text` mark.
     */
    text?: TextDef<F>;

    /**
     * Facet identifier for interactive filtering, sorting, and grouping in the App.
     */
    sample?: FieldDefWithoutScale<F>;

    /**
     * For internal use
     */
    // TODO: proper type
    uniqueId?: FieldDefWithoutScale<F>;

    // TODO: proper type
    search?: FieldDefWithoutScale<F>;

    /**
     * For internal use
     */
    // TODO: proper type
    facetIndex?: FieldDefWithoutScale<F>;

    semanticScore?: FieldDefWithoutScale<F>;
}
