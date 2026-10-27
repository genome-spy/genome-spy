import { StateWithHistory } from "redux-undo";
import { SampleHierarchy } from "./sampleView/state/sampleState.js";
import type { ParamProvenanceState } from "./state/paramProvenanceTypes.d.ts";

export type {
    ParamValueLiteral,
    ParamValueInterval,
    ParamValuePoint,
    ParamValueRecordPoint,
    ParamValueCategoryPoint,
    ParamValue,
    ParamOrigin,
    ParamProvenanceEntry,
    ParamProvenanceState,
} from "./state/paramProvenanceTypes.d.ts";

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
    ViewVisibilityEntry[] | Record<string, boolean>;

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
        submissionKind?: "user" | "agent" | "bookmark";
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
