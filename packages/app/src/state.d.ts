import { StateWithHistory } from "redux-undo";
import { SampleHierarchy } from "./sampleView/state/sampleState.js";
import {
    ParamSelector,
    ViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import { Scalar } from "@genome-spy/core/spec/channel.js";
import { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";

export interface ParamValueLiteral {
    type: "value";
    value: any;
}

export interface ParamValueInterval {
    type: "interval";
    intervals: Partial<
        Record<
            "x" | "y",
            [number, number] | [ChromosomalLocus, ChromosomalLocus] | null
        >
    >;
}

export interface ParamValuePoint {
    type: "point";
    keyFields: string[];
    keys: Scalar[][];
}

export type ParamValue =
    | ParamValueLiteral
    | ParamValueInterval
    | ParamValuePoint;

export interface ParamOrigin {
    type: "datum";
    view: ViewSelector;
    keyField: string;
    key: Scalar;
    intervalSources?: Record<string, { start?: string; end?: string }>;
}

export interface ParamProvenanceEntry {
    selector: ParamSelector;
    value: ParamValue;
    origin?: ParamOrigin;
}

export interface ParamProvenanceState {
    entries: Record<string, ParamProvenanceEntry>;
}

export interface ViewSettings {
    /**
     * Visibilities of views keyed by selector keys. The keys are derived from
     * view selectors and may also include legacy view names from old bookmarks.
     */
    visibilities: Record<string, boolean>;
}

export interface ViewVisibilityEntry {
    scope: string[];
    view: string;
    visible: boolean;
}

export type ViewVisibilityWire =
    | ViewVisibilityEntry[]
    | Record<string, boolean>;

export interface ViewSettingsPayload {
    visibilities?: ViewVisibilityWire;
}

export interface State {
    viewSettings: ViewSettings;
    /**
     * Tracks async intent status and records provenance indices for rollback.
     */
    intentStatus?: {
        status: "idle" | "running" | "error" | "canceled";
        startIndex?: number;
        lastSuccessfulIndex?: number;
        totalActions?: number;
        currentIndex?: number;
        currentAction?: import("@reduxjs/toolkit").Action;
        failedAction?: import("@reduxjs/toolkit").Action;
        error?: string;
    };
    provenance?: StateWithHistory<{
        sampleView: SampleHierarchy;
        paramProvenance: ParamProvenanceState;
        lastAction: import("@reduxjs/toolkit").Action;
    }>;
}
