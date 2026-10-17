import {
    FormulaParams,
    ExprFilterParams,
    SampleParams,
    AggregateParams,
    WindowParams,
} from "../spec/transform.js";

/** A reservoir sample with the existing default size of 500. */
export interface AnalysisSampleParams extends Omit<SampleParams, "size"> {
    /**
     * Maximum sample size; must be a positive safe integer.
     * @minimum 1
     * @maximum 9007199254740991
     * @multipleOf 1
     */
    size?: number;
}

/** Supported one-shot transforms, using the existing visualization grammar. */
export type AnalysisTransformParams =
    | Omit<FormulaParams, "debounce">
    | Omit<ExprFilterParams, "debounce">
    | AnalysisSampleParams
    | AggregateParams
    | WindowParams;

/** Request for a bounded calculation on a unit view's current records. */
export interface TransformDataOptions {
    /** Capture records inside the viewport or a named interval brush. */
    scope: "viewport" | { selection: string };

    /** Explicit pipeline; expressions have datum and built-ins, without live view parameters. */
    transform: readonly AnalysisTransformParams[];

    /**
     * Maximum captured input size. Overflow rejects before analysis starts.
     * @minimum 0
     * @maximum 9007199254740991
     * @multipleOf 1
     */
    inputLimit: number;

    /**
     * Maximum returned row count, applied after the complete calculation.
     * @minimum 0
     * @maximum 9007199254740991
     * @multipleOf 1
     */
    limit: number;
}
