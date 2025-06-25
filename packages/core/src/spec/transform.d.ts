import { PositionalChannel } from "./channel.js";

/**
 * The name of the field or a JavaScript expression for accessing nested properties.
 * Dots and brackets in the field name must be escaped.
 */
export type Field = string;

export interface TransformParamsBase {
    /** The type of the transform to be applied */
    type: string;
}

export interface IdentifierParams extends TransformParamsBase {
    type: "identifier";

    /**
     * **Default:** `"_uniqueId"`
     */
    as?: string;
}
export interface ExprFilterParams extends TransformParamsBase {
    type: "filter";

    /** An expression string. The data object is removed if the expression evaluates to false. */
    expr: string;
}

export interface SelectionFilterParams extends TransformParamsBase {
    type: "filter";

    /**
     * A selection parameter. The data object is removed if it is not part of the selection.
     */
    param: string;

    /**
     * If true, the filter retains all data objects when the selection is empty.

     * **Default:** `true`
     */
    empty?: boolean;

    /**
     * An optional mapping of positional channels to fields. Used to determine which fields
     * are checked against the selection intervals.
     */
    fields?: Partial<Record<PositionalChannel, Field>>;
}

export type FilterParams = ExprFilterParams | SelectionFilterParams;

export interface FormulaParams extends TransformParamsBase {
    type: "formula";

    /** An expression string */
    expr: string;

    /** The (new) field where the computed value is written to */
    as: string;
}

export interface ProjectParams extends TransformParamsBase {
    type: "project";

    /**
     * The fields to be projected.
     */
    fields: Field[];

    /**
     * New names for the projected fields. If omitted, the names of the source fields are used.
     */
    as?: string[];
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
    type: "regexFold";

    /**
     * A regular expression that matches to column names. The regex must have one
     * capturing group that is used for extracting the key (e.g., a sample id)
     * from the column name.
     */
    columnRegex: string[] | string;

    /**
     * A new column name for the extracted values.
     */
    asValue: string[] | string;

    /**
     * An optional regex that matches to fields that should not be included
     * in the new folded data objects.
     */
    skipRegex?: string;

    /**
     * **Default:** `"sample"`
     */
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
     * `"information"` computes a layout for a sequence logo. The total height of the stack reflects
     * the group's information content.
     */
    offset?: "zero" | "center" | "normalize" | "information";

    /**
     * Fields to write the stacked values.
     *
     * **Default:** `["y0", "y1"]`
     */
    as: string[];

    /**
     * Cardinality, e.g., the number if distinct bases or amino acids. Used for
     * information content calculation when the offset is `"information"`.
     *
     * **Default:** `4`
     */
    cardinality?: number;

    /**
     * The field that contains the base or amino acid. Used for
     * information content calculation when the offset is `"information"`.
     * The data objects that have `null` in the baseField are considered gaps
     * and they are taken into account when scaling the the locus' information
     * content.
     */
    baseField?: Field;
}

export type AggregateOp =
    | "count"
    | "valid"
    | "sum"
    | "min"
    | "max"
    | "mean"
    | "median"
    | "variance";

export interface AggregateParams extends TransformParamsBase {
    type: "aggregate";

    /**
     * The fields by which to group the data. If these are not defined, all data
     * objects will be grouped into a single category.
     */
    groupby?: Field[];

    /**
     * The data fields to apply aggregate functions to. This array should
     * correspond with the `ops` and `as` arrays. If no fields or operations
     * are specified, a count aggregation will be applied by default.
     */
    fields?: Field[];

    /**
     * The aggregation operations to be performed on the fields, such as `"sum"`,
     * `"average"`, or `"count"`.
     */
    ops?: AggregateOp[];

    /**
     * The names for the output fields corresponding to each aggregated field.
     * If not provided, names will be automatically created using the operation
     * and field names (e.g., `sum_field`, `average_field`).
     */
    as?: string[];
}

export interface FlattenParams extends TransformParamsBase {
    type: "flatten";

    /**
     * The field(s) to flatten. If no field is defined, the data object itself
     * is treated as an array to be flattened.
     */
    fields?: Field[] | Field;

    /**
     * The output field name for the zero-based index of the array values. If unspecified, an index field is not added.
     */
    index?: string;

    /**
     * The output field name(s) for the flattened field.
     *
     * **Default:** the input fields.
     */
    as?: string[] | string;
}

export interface FlattenDelimitedParams extends TransformParamsBase {
    type: "flattenDelimited";

    /**
     * The field(s) to split and flatten
     */
    // TODO: Rename to prular to make it consistent with the other flatten transforms
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

export interface FlattenSequenceParams extends TransformParamsBase {
    type: "flattenSequence";

    /**
     * The field to flatten.
     *
     * **Default:** `"sequence"`
     */
    field?: Field;

    /**
     * Name of the fields where the zero-based index number and flattened
     * sequence letter are written to.
     *
     * **Default:** `["pos", "sequence"]`
     */
    // TODO: Introduce "index" property to make it consistent with the other flatten transforms
    as?: [string, string];
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

    /**
     * An optional field indicating the preferred lane. Use together with the
     * `preferredOrder` property.
     */
    preference?: Field;

    /**
     * The order of the lane preferences. The first element contains the value that
     * should place the segment on the first lane and so forth.
     * If the preferred lane is occupied, the first available lane is taken.
     */
    preferredOrder?: string[] | number[] | boolean[];
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
     * Arranges the data into consecutive batches based on the groups.
     * This is mainly intended for internal use so that faceted data can
     * be handled as batches.
     */
    groupby?: Field[];

    /**
     * The sort order.
     */
    sort?: CompareParams;
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

export interface MergeFacetsParams extends TransformParamsBase {
    type: "mergeFacets";
}

export interface LinearizeGenomicCoordinateParams extends TransformParamsBase {
    type: "linearizeGenomicCoordinate";

    /**
     * Get the genome assembly from the scale of the channel.
     *
     * **Default:** `"x"`
     */
    channel?: "x" | "y";

    /**
     * The chromosome/contig field
     */
    chrom: Field;

    /**
     * The field or fields that contain intra-chromosomal positions
     */
    pos: Field | Field[];

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
    offset?: number | number[];

    /**
     * The output field or fields for linearized coordinates.
     */
    as: string | string[];
}

export interface FilterScoredLabelsParams extends TransformParamsBase {
    type: "filterScoredLabels";

    /**
     * The field representing the score used for prioritization.
     */
    score: Field;

    /**
     * The field representing element's width in pixels.
     */
    width: Field;

    /**
     * The field representing element's start position on the domain.
     */
    pos: Field;

    /**
     * The field representing element's end position on the domain.
     * If not specified, the `pos` field is used.
     */
    pos2?: Field;

    /**
     * Outputs the average of pos and pos2 as the midpoint of the element.
     * This is useful for elements that have a width, such as transcripts.
     * The midpoint is clamped to the visible region of the element.
     */
    midpointAs?: string;

    /**
     * An optional field representing element's lane, e.g., if transcripts
     * are shown using a piled up layout. Each line is processed separately.
     */
    lane?: Field;

    /**
     * Padding (in pixels) around the element.
     *
     * **Default:** `0`
     */
    padding?: number;

    /**
     * **Default:** `"x"`
     */
    channel?: "x" | "y";
}

export interface FlattenCompressedExonsParams extends TransformParamsBase {
    type: "flattenCompressedExons";

    /**
     * The field containing the exons.
     *
     * **Default:** `"exons"`
     */
    exons?: Field;

    /**
     * Start coordinate of the gene body.
     *
     * **Default:** `"start"`
     */
    start?: Field;

    /**
     * Field names for the flattened exons.
     *
     * **Default:** `["exonStart", "exonEnd"]`
     */
    as?: [string, string];
}

export type TransformParams =
    | AggregateParams
    | CollectParams
    | CoverageParams
    | FlattenDelimitedParams
    | FormulaParams
    | FilterParams
    | FilterScoredLabelsParams
    | FlattenParams
    | FlattenCompressedExonsParams
    | FlattenSequenceParams
    | IdentifierParams
    | LinearizeGenomicCoordinateParams
    | MeasureTextParams
    | MergeFacetsParams
    | PileupParams
    | ProjectParams
    | RegexExtractParams
    | RegexFoldParams
    | SampleParams
    | StackParams;
