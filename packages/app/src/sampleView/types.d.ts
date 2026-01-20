import { SampleHierarchy } from "./state/sampleState.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";

/**
 * An identifier for an abstract attribute. Allows for retrieving an accessor and information.
 *
 * TODO: Stricter typing
 */
export interface AttributeIdentifier {
    type: string;
    specifier?: unknown;
}

export type IntervalPoint = number | ChromosomalLocus;

export type Interval = [IntervalPoint, IntervalPoint];

export type AggregationOp = "min" | "max" | "weightedMean" | "count";

export interface AggregationSpec {
    op: AggregationOp;
}

export interface AttributeInfo {
    /**
     * A concise name of the attribute: TODO: Used for what?
     * @deprecated Use attribute instead
     */
    name: string;

    attribute: AttributeIdentifier;

    /** More detailed name with optional formatting */
    title?: string | import("lit").TemplateResult;

    /** Function that maps a sampleId to an attribute value */
    accessor: (sampleId: string, sampleHierarchy: SampleHierarchy) => any;

    /** e.g., "quantitative" */
    type: string;

    scale?: any;
}
