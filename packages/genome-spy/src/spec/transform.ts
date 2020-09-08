export interface TransformConfigBase {
    /** The type of the transform to be applied */
    type: string;
}

export interface FilterConfig extends TransformConfigBase {
    type: "filter";

    /** An expression string. The row is removed if the expression evaluates to false. */
    expr: string;
}

export interface FormulaConfig extends TransformConfigBase {
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

export interface RegexExtractConfig extends TransformConfigBase {
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
    field: string;

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

export interface GatherConfig extends TransformConfigBase {
    type: "gather";

    columnRegex: string;

    asValue: string;

    /** **Default:** `"sample"` */
    asKey?: string;
}

export type SortOrder = "ascending" | "descending";

export interface CompareConfig {
    /**
     * The name(s) of the field to sort.
     */
    field: string[] | string;

    /**
     * The order(s) to use: `"ascending"` (default), `"descending"`.
     */
    order: SortOrder[] | SortOrder;
}

export interface StackConfig extends TransformConfigBase {
    type: "stack";

    /**
     * The field to stack. If no field is defined, a constant value of one is assumed.
     */
    field?: string;

    /**
     * The fields to be used for forming groups for different stacks.
     */
    groupby: string[];

    /**
     * The sort order of data in each stack.
     */
    sort?: CompareConfig;

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

export interface FlattenDelimitedConfig extends TransformConfigBase {
    type: "flattenDelimited";

    /**
     * Field(s) to split and flatten
     */
    field: string[] | string;

    /**
     * Separator(s) used on the field(s)
     */
    separator: string[] | string;

    /**
     * The output field name(s) for the flattened field.
     *
     * **Default:** the input fields.
     */
    as?: string[] | string;
}

export interface SimpleFilterConfig extends TransformConfigBase {
    type: "simpleFilter";

    field: string;

    operator: "eq" | "neq" | "lt" | "lte" | "gte";

    value: number | string | boolean;
}

export interface PileupConfig extends TransformConfigBase {
    type: "pileup";

    start: string;

    end: string;

    /**
     * The output field name for the computed lane.
     *
     * **Default:** `"lane"`.
     */
    as?: string;

    /**
     * Spacing between adjacent elements on the same lane.
     *
     * **Default:** `1`.
     */
    spacing?: number;
}

export interface CoverageConfig extends TransformConfigBase {
    type: "coverage";

    chrom?: string;

    start: string;

    end: string;

    weight?: string;

    as?: string;

    asChrom?: string;

    asStart?: string;

    asEnd?: string;

    // TODO: Chrom
}

export interface UngroupConfig extends TransformConfigBase {
    type: "ungroup";
}

export type TransformConfig =
    | UngroupConfig
    | FlattenDelimitedConfig
    | FormulaConfig
    | GatherConfig
    | RegexExtractConfig
    | SimpleFilterConfig
    | StackConfig
    | PileupConfig;
