import { ViewAttributeSpecifier } from "./sampleViewTypes.js";
import { SampleHierarchy } from "./state/sampleState.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";

/**
 * Stable identifier for an abstract attribute used by actions and agent
 * context.
 *
 * `type` identifies the attribute source kind, and `specifier` contains the
 * concrete lookup information for that source.
 *
 * Examples:
 * - `{ type: "SAMPLE_ATTRIBUTE", specifier: "age" }`
 * - `{ type: "VALUE_AT_LOCUS", specifier: { ... } }`
 */
export type AttributeIdentifierType =
    | "SAMPLE_ATTRIBUTE"
    | "VALUE_AT_LOCUS"
    | "SAMPLE_NAME"
    | "VIEW_ATTRIBUTE";

export interface AttributeIdentifier {
    type: AttributeIdentifierType;
    specifier?: string | ViewAttributeSpecifier;
}

/**
 * One endpoint of an interval.
 */
export type IntervalPoint = number | ChromosomalLocus;

/**
 * Interval expressed as two scalar or locus points.
 */
export type Interval = [IntervalPoint, IntervalPoint];

/**
 * Aggregation operators supported by interval-based attribute access.
 */
export type AggregationOp =
    | "min"
    | "max"
    | "weightedMean"
    | "variance"
    | "count";

/**
 * Aggregation configuration for interval-derived attribute access.
 */
export interface AggregationSpec {
    op: AggregationOp;
}

/**
 * Arguments passed to attribute value providers, including the current
 * selection of sample ids and optional interval/aggregation context.
 */
export interface AttributeValuesScope {
    sampleIds: string[];
    sampleHierarchy: SampleHierarchy;
    interval?: Interval;
    aggregation?: AggregationSpec;
}

/**
 * Context passed to attribute availability hooks.
 */
export interface AttributeEnsureContext {
    signal?: AbortSignal;
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

    /**
     * Optional description of the attribute. Can be used in UI and agent
     * context to explain the meaning of the attribute.
     */
    description?: string;

    /** Function that maps a sampleId to an attribute value */
    accessor: (sampleId: string, sampleHierarchy: SampleHierarchy) => any;

    /**
     * Provides values for dialogs (e.g., histograms) with optional interval aggregation.
     * Use `extractAttributeValues` for the default fallback implementation.
     */
    valuesProvider: (scope: AttributeValuesScope) => any[];

    /** e.g., "quantitative" */
    type: string;

    /**
     * Optional hook for ensuring attribute availability before access.
     * Used by async intent processing to resolve lazy data dependencies.
     */
    ensureAvailability?: (context: AttributeEnsureContext) => Promise<void>;

    /**
     * Optional hook for awaiting post-dispatch readiness.
     * Used by async intent processing to guarantee that state and data are ready.
     */
    awaitProcessed?: (context: AttributeEnsureContext) => Promise<void>;

    scale?: any;
}
