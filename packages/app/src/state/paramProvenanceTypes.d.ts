import type { Scalar } from "@genome-spy/core/spec/channel.js";
import type { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";
import type {
    ParamSelector,
    ViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import type {
    SelectionExpansionPredicate,
    SelectionExpansionRule,
} from "./selectionExpansion.js";

/**
 * Shared type aliases for param provenance payloads.
 *
 * These types describe the bookmarkable selection state that can be replayed
 * and surfaced to the agent.
 */
export type ParamValueLiteral = {
    /**
     * Literal param value.
     */
    type: "value";

    /**
     * Stored literal value.
     */
    value: any;
};

export type ParamValueInterval = {
    /**
     * Interval selection value.
     */
    type: "interval";

    /**
     * Interval endpoints keyed by encoding channel.
     */
    intervals: Partial<
        Record<
            "x" | "y",
            [number, number] | [ChromosomalLocus, ChromosomalLocus] | null
        >
    >;
};

export type ParamValuePoint = {
    /**
     * Point selection value.
     */
    type: "point";

    /**
     * Fields used to identify selected points.
     */
    keyFields: string[];

    /**
     * Selected key tuples.
     */
    keys: Scalar[][];
};

/**
 * Origin of a param value derived from a datum or interval lookup.
 */
export type ParamOrigin = {
    /**
     * Origin type.
     */
    type: "datum";

    /**
     * View that contributed the value.
     */
    view: ViewSelector;

    /**
     * Field that supplied the value.
     */
    keyField: string;

    /**
     * Scalar value captured from the source datum.
     */
    key: Scalar;

    /**
     * Optional interval sources used for replay and diagnostics.
     */
    intervalSources?: Record<string, { start?: string; end?: string }>;
};

/**
 * Back-reference for point selection expansion.
 */
export type PointExpandOrigin = {
    /**
     * View that produced the point selection.
     */
    view: ViewSelector;

    /**
     * Selected tuple captured at expansion time.
     */
    keyTuple: Scalar[];

    /**
     * Legacy support: older bookmarks may include these.
     * New payloads should omit them.
     */
    keyFields?: string[];

    /**
     * Legacy datum marker retained for old bookmarks.
     */
    type?: "datum";
};

/**
 * Matcher used to expand a point selection either by rule or predicate.
 */
export type PointExpandMatcher =
    | { rule: SelectionExpansionRule; predicate?: never }
    | { predicate: SelectionExpansionPredicate; rule?: never };

/**
 * Expanded point selection value stored in provenance.
 */
export type ParamValuePointExpand = {
    /**
     * Expanded point-selection value.
     */
    type: "pointExpand";

    /**
     * Operation applied to the current selection.
     */
    operation: "replace" | "add" | "remove" | "toggle";

    /**
     * Optional partitioning fields used during expansion.
     */
    partitionBy?: string[];

    /**
     * Original point selection that was expanded.
     */
    origin: PointExpandOrigin;
} & PointExpandMatcher;

/**
 * Bookmarkable param value stored in provenance.
 */
export type ParamValue =
    | ParamValueLiteral
    | ParamValueInterval
    | ParamValuePoint
    | ParamValuePointExpand;

/**
 * Payload for creating or updating a reactive selection or parameter value,
 * including point selections, interval selections, and genomic-region
 * selections.
 */
export interface ParamProvenanceEntry {
    /**
     * Structured selector for the parameter.
     */
    selector: ParamSelector;

    /**
     * Serialized parameter value.
     */
    value: ParamValue;

    /**
     * Optional datum origin for replayable values.
     */
    origin?: ParamOrigin;
}

/**
 * Payload for expanding a point selection.
 */
export type ExpandPointSelectionActionPayload = {
    /**
     * Target param selector.
     */
    selector: ParamSelector;

    /**
     * Expansion operation.
     */
    operation: "replace" | "add" | "remove" | "toggle";

    /**
     * Optional partitioning fields for the expansion.
     */
    partitionBy?: string[];

    /**
     * Back-reference to the point selection origin.
     */
    origin: PointExpandOrigin;
    // TODO(app): Consider optional replay-drift diagnostics here, for example
    // expectedMatchCount/sourceDataFingerprint, if semantic replay warnings are needed.
} & PointExpandMatcher;

/**
 * Param provenance map keyed by selector key.
 */
export type ParamProvenanceState = {
    entries: Record<string, ParamProvenanceEntry>;
};
