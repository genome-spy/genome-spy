import type { Action } from "@reduxjs/toolkit";
import type {
    AttributeIdentifier,
    AttributeInfo,
} from "../sampleView/types.d.ts";
import type { AppRootSpec } from "../spec/appSpec.d.ts";
import type { SampleHierarchy } from "../sampleView/state/sampleState.js";
import type { ViewSelector } from "../sampleView/sampleViewTypes.d.ts";
import type { ProvenanceAction } from "../state/provenance.js";
import type { ActionInfo } from "../state/provenance.js";
export interface AgentApi {
    /**
     * Returns the current sample hierarchy used by the agent context.
     */
    getSampleHierarchy(): SampleHierarchy | undefined;

    getAttributeInfo(attribute: AttributeIdentifier): AttributeInfo | undefined;

    getSampleParamConfig(
        paramName: string
    ): { description?: string } | undefined;

    getSearchableViews(): unknown[];

    getViewRoot(): import("@genome-spy/core/view/view.js").default | undefined;

    /**
     * Returns the current focus view for tree normalization and expansion.
     * This is typically the current sample view.
     */
    getFocusedView():
        | import("@genome-spy/core/view/view.js").default
        | undefined;

    /**
     * Returns the root spec used to summarize the top-level visualization.
     */
    getRootSpec(): AppRootSpec;

    resolveViewSelector(
        selector: ViewSelector
    ): import("@genome-spy/core/view/view.js").default | undefined;

    /**
     * Returns the provenance actions currently available to the agent.
     */
    getActionHistory(): ProvenanceAction[];

    getActionInfo(action: Action): ActionInfo | undefined;

    /**
     * Submits a prepared set of actions to the app intent pipeline.
     */
    submitIntentActions(
        actions: Action[],
        options?: { submissionKind?: "agent" | "bookmark" | "user" }
    ): Promise<void>;

    /**
     * Returns the current provenance state used by selection and timeline tools.
     */
    getPresentProvenanceState():
        | import("../state/setupStore.js").AppState["provenance"]["present"]
        | undefined;

    setViewVisibility(selector: ViewSelector, visibility: boolean): void;

    jumpToProvenanceState(provenanceId: string): boolean;

    jumpToInitialProvenanceState(): boolean;
}
