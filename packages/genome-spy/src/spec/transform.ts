/**
 * The name of the field or a JavaScript expression for accessing nested properties.
 * Dots and brackets in the field name must be escaped.
 */
export type Field = string;

export interface TransformParamsBase {
    /** The type of the transform to be applied */
    type: string;
}

export interface FilterParams extends TransformParamsBase {
    type: "filter";

    /** An expression string. The row is removed if the expression evaluates to false. */
    expr: string;
}

export interface FormulaParams extends TransformParamsBase {
    type: "formula";

    /** An expression string */
    expr: string;

    /** The (new) field where the computed value is written to */
    as: string;

    /**
     * Modify the rows in place (a temporary hack). Will be removed.
     *
     * **Default:** `false`
     */
    inplace?: boolean;
}

export interface RegexExtractParams extends TransformParamsBase {
    type: "regexExtract";

    /**
     * A valid JavaScript regular expression with at least one group. For example: `"^Sample(\\d+)$"`.
     *
     * Read more at: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
     **/
    regex: string;

    /**
     * The source field
     */
    field: Field;

    /**
     * The new field or an array of fields where the extracted values are written.
     */
    as: string | string[];

    /**
     * Do not complain about invalid input. Just skip it and leave the new fields undefined on the affected datum.
     *
     * **Default:** `false`
     **/
    skipInvalidInput?: boolean;
}

export interface RegexFoldParams extends TransformParamsBase {
    type: "gather";

    columnRegex: string;

    asValue: string;

    /** **Default:** `"sample"` */
    asKey?: string;
}

export type SortOrder = "ascending" | "descending";

export interface CompareParams {
    /**
     * The field(s) to sort by
     */
    field: Field[] | Field;

    /**
     * The order(s) to use: `"ascending"` (default), `"descending"`.
     */
    order?: SortOrder[] | SortOrder;
}

export interface StackParams extends TransformParamsBase {
    type: "stack";

    /**
     * The field to stack. If no field is defined, a constant value of one is assumed.
     */
    field?: Field;

    /**
     * The fields to be used for forming groups for different stacks.
     */
    groupby: Field[];

    /**
     * The sort order of data in each stack.
     */
    sort?: CompareParams;

    /**
     * How to offset the values in a stack.
     * `"zero"` (default) starts stacking at 0.
     * `"center"` centers the values around zero.
     * `"normalize"` computes intra-stack percentages and normalizes the values to the range of `[0, 1]`.
     */
    offset?: "zero" | "center" | "normalize";

    /**
     * Fields to write the stacked values.
     *
     * **Default:** `["y0", "y1"]`
     */
    as: string[];
}

export interface FlattenDelimitedParams extends TransformParamsBase {
    type: "flattenDelimited";

    /**
     * The field(s) to split and flatten
     */
    field: Field[] | Field;

    /**
     * Separator(s) used on the field(s)
     * TODO: Rename to delimiter
     */
    separator: string[] | string;

    /**
     * The output field name(s) for the flattened field.
     *
     * **Default:** the input fields.
     */
    as?: string[] | string;
}

export interface PileupParams extends TransformParamsBase {
    type: "pileup";

    /**
     * The field representing the start coordinate of the segment (inclusive).
     */
    start: Field;

    /**
     * The field representing the end coordinate of the segment (exclusive).
     */
    end: Field;

    /**
     * The output field name for the computed lane.
     *
     * **Default:** `"lane"`.
     */
    as?: string;

    /**
     * The spacing between adjacent segments on the same lane in coordinate units.
     *
     * **Default:** `1`.
     */
    spacing?: number;
}

export interface CoverageParams extends TransformParamsBase {
    type: "coverage";

    /**
     * An optional chromosome field that is passed through. TODO: groupby
     */
    chrom?: Field;

    /**
     * The field representing the start coordinate of the segment (inclusive).
     */
    start: Field;

    /**
     * The field representing the end coordinate of the segment (exclusive).
     */
    end: Field;

    /**
     * A field representing an optional weight for the segment. Can be used with
     * copy ratios, for example.
     */
    weight?: Field;

    /**
     * The output field for the computed coverage.
     */
    as?: string;

    /**
     * The output field for the chromosome.
     *
     * **Default:** Same as `chrom`
     */
    asChrom?: string;

    /**
     * The output field for the start coordinate.
     *
     * **Default:** Same as `start`
     */
    asStart?: string;

    /**
     * The output field for the end coordinate.
     *
     * **Default:** Same as `end`
     */
    asEnd?: string;
}

export interface CollectParams extends TransformParamsBase {
    type: "collect";

    /**
     * The sort order.
     */
    sort: CompareParams;
}

export interface SampleParams extends TransformParamsBase {
    type: "sample";

    /**
     * The maximum sample size.
     *
     * **Default:** `500`
     */
    size?: number;
}

export interface MeasureTextParams extends TransformParamsBase {
    type: "measureText";

    field: Field;

    fontSize: number;

    as: string;

    // TODO: FontFamily etc
}

export interface LinearizeGenomicCoordinateParams extends TransformParamsBase {
    type: "linearizeGenomicCoordinate";

    /** Get the assembly from the scale of the channel.
     *
     * **Default:** `"x"`
     */
    channel?: "x" | "y";

    chrom: Field;
    pos: Field;

    as: string;
}

export type TransformParams =
    | CollectParams
    | FlattenDelimitedParams
    | FormulaParams
    | FilterParams
    | PileupParams
    | RegexExtractParams
    | RegexFoldParams
    | SampleParams
    | StackParams;
