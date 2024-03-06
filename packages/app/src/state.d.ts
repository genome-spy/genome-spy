import { StateWithHistory } from "redux-undo";
import { SampleHierarchy } from "./sampleView/sampleState.js";

export interface ViewSettings {
    /**
     * Visibilities of views keyed by the view name. The view names must be
     * unique within the whole view specification. Only entries that differ
     * from the configured default visibility should be included.
     */
    visibilities: Record<string, boolean>;
}

export interface State {
    viewSettings: ViewSettings;
    provenance?: StateWithHistory<SampleHierarchy>;
}
