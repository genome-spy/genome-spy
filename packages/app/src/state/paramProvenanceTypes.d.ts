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
 * These types are used across reducers, provenance bridge, and action-info
 * rendering to keep the payload contract synchronized.
 */
export type ParamValueLiteral = {
    type: "value";
    value: any;
};

export type ParamValueInterval = {
    type: "interval";
    intervals: Partial<
        Record<
            "x" | "y",
            [number, number] | [ChromosomalLocus, ChromosomalLocus] | null
        >
    >;
};

export type ParamValuePoint = {
    type: "point";
    keyFields: string[];
    keys: Scalar[][];
};

export type ParamOrigin = {
    type: "datum";
    view: ViewSelector;
    keyField: string;
    key: Scalar;
    intervalSources?: Record<string, { start?: string; end?: string }>;
};

export type PointExpandOrigin = {
    view: ViewSelector;
    keyTuple: Scalar[];
    /**
     * Legacy support: older bookmarks may include these.
     * New payloads should omit them.
     */
    keyFields?: string[];
    type?: "datum";
};

export type PointExpandMatcher =
    | { rule: SelectionExpansionRule; predicate?: never }
    | { predicate: SelectionExpansionPredicate; rule?: never };

export type ParamValuePointExpand = {
    type: "pointExpand";
    operation: "replace" | "add" | "remove" | "toggle";
    partitionBy?: string[];
    origin: PointExpandOrigin;
} & PointExpandMatcher;

export type ParamValue =
    | ParamValueLiteral
    | ParamValueInterval
    | ParamValuePoint
    | ParamValuePointExpand;

export type ParamProvenanceEntry = {
    selector: ParamSelector;
    value: ParamValue;
    origin?: ParamOrigin;
};

export type ExpandPointSelectionActionPayload = {
    selector: ParamSelector;
    operation: "replace" | "add" | "remove" | "toggle";
    partitionBy?: string[];
    origin: PointExpandOrigin;
    // TODO(app): Consider optional replay-drift diagnostics here, for example
    // expectedMatchCount/sourceDataFingerprint, if semantic replay warnings are needed.
} & PointExpandMatcher;

export type ParamProvenanceState = {
    entries: Record<string, ParamProvenanceEntry>;
};
