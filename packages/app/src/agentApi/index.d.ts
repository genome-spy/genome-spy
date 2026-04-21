/**
 * App-owned boundary exposed to the agent package.
 *
 * `AgentApi` is the centralized handle for host state, provenance, and view
 * mutations that the extracted agent package may use.
 */
import type { Action } from "@reduxjs/toolkit";
import type {
    ActionInfo,
    AttributeIdentifier,
    AttributeInfo,
    AppRootSpec,
    AppState,
    ProvenanceAction,
    SampleHierarchy,
    ViewSelector,
} from "../agentShared/index.d.ts";
import type UnitView from "@genome-spy/core/view/unitView.js";
export interface AgentApi {
    /**
     * Returns the current sample hierarchy used by the agent context.
     */
    getSampleHierarchy(): SampleHierarchy | undefined;

    getAttributeInfo(attribute: AttributeIdentifier): AttributeInfo | undefined;

    /**
     * Returns the current SampleView-scoped param config.
     *
     * TODO(app): Make this unscoped and accept a `ParamSelector` once the
     * agent boundary no longer needs the SampleView-local lookup.
     */
    getSampleViewScopedParamConfig(
        paramName: string
    ): { description?: string } | undefined;

    getSearchableViews(): UnitView[];

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
    getPresentProvenanceState(): AppState["provenance"]["present"] | undefined;

    setViewVisibility(selector: ViewSelector, visibility: boolean): void;

    jumpToProvenanceState(provenanceId: string): boolean;

    jumpToInitialProvenanceState(): boolean;
}
