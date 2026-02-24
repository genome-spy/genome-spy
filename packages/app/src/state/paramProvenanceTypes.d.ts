import type { Scalar } from "@genome-spy/core/spec/channel.js";
import type { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";
import type {
    ParamSelector,
    ViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import type { SelectionExpansionPredicate } from "./selectionExpansion.js";

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
    type: "datum";
    view: ViewSelector;
    keyFields: string[];
    keyTuple: Scalar[];
};

export type ParamValuePointExpand = {
    type: "pointExpand";
    operation: "replace" | "add" | "remove" | "toggle";
    predicate: SelectionExpansionPredicate;
    partitionBy?: string[];
    origin: PointExpandOrigin;
    label?: string;
};

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
    predicate: SelectionExpansionPredicate;
    partitionBy?: string[];
    origin: PointExpandOrigin;
    label?: string;
};

export type ParamProvenanceState = {
    entries: Record<string, ParamProvenanceEntry>;
};
