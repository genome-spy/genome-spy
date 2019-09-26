
export interface TransformConfigBase {
    /** The type of the transform to be applied */
    type: string;
}

export interface FormulaConfig extends TransformConfigBase {
    type: "formula";

    /** An expression string */
    expr: string;

    /** The (new) field where the computed value is written to */
    as: string;

    /** Modify the rows in place (a temporary hack). Will be removed. */
    inplace?: boolean;
}


export interface RegexExtractConfig extends TransformConfigBase {
    type: "regexExtract";

    /**
     * A valid JavaScript regular expression with at least one group. For example: `"^Sample(\\d+)$".
     * Read more at: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
     **/
    regex: string;

    /**
     * The field that is subject to extraction.
     */
    field: string;

    /**
     * The new field or an array of fields where the extracted values are written.
     */
    as: string | string[];

    /**
     * Do not complain about invalid input. Just skip it and leave the new fields undefined on the affected datum.
     * Default: false
     **/
    skipInvalidInput?: boolean;
}


export interface GatherConfig extends TransformConfigBase {
    type: "gather";

    columnRegex: string;

    asValue: string;

    /** Default: sample */
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

export type StackOffset = "zero" | "center" | "normalize";

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
     * "zero" (default) starts stacking at 0.
     * "center" centers the values around zero.
     * "normalize" computes intra-stack percentages and normalizes the values to the range of [0, 1].
     */
    offset?: StackOffset;

    /**
     * Fields to write the stacked values. Default: ["y0", "y1"]
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
     * The output field name(s) for the flattened field. Default: the input fields.
     */
    as?: string[] | string;
}

export interface SimpleFilterConfig extends TransformConfigBase {
    type: "simpleFilter";

    field: string;

    operator: "eq" | "neq" | "lt" | "lte" | "gte";

    value: number | string | boolean;
}