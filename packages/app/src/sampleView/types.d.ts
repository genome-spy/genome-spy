import { ViewAttributeSpecifier } from "./sampleViewTypes.js";
import { SampleHierarchy } from "./state/sampleState.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";

/**
 * An identifier for an abstract attribute. Allows for retrieving an accessor and information.
 */
export interface AttributeIdentifier {
    type: string;
    specifier?: string | ViewAttributeSpecifier;
}

export type IntervalPoint = number | ChromosomalLocus;

export type Interval = [IntervalPoint, IntervalPoint];

export type AggregationOp =
    | "min"
    | "max"
    | "weightedMean"
    | "variance"
    | "count";

export interface AggregationSpec {
    op: AggregationOp;
}

export interface AttributeValuesScope {
    sampleIds: string[];
    sampleHierarchy: SampleHierarchy;
    interval?: Interval;
    aggregation?: AggregationSpec;
}

export interface AttributeInfo {
    /**
     * A concise name of the attribute: TODO: Used for what?
     * @deprecated Use attribute instead
     */
    name: string;

    attribute: AttributeIdentifier;

    /** More detailed name with optional formatting */
    title: string | import("lit").TemplateResult;

    /** Formatted attribute name for context menus (e.g., with selective emphasis). */
    emphasizedName: string | import("lit").TemplateResult;

    /** Function that maps a sampleId to an attribute value */
    accessor: (sampleId: string, sampleHierarchy: SampleHierarchy) => any;

    /**
     * Provides values for dialogs (e.g., histograms) with optional interval aggregation.
     * Use `extractAttributeValues` for the default fallback implementation.
     */
    valuesProvider: (scope: AttributeValuesScope) => any[];

    /** e.g., "quantitative" */
    type: string;

    scale?: any;
}
