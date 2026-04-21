import type {
    AttributeIdentifier,
    AttributeInfo,
} from "../sampleView/types.d.ts";
import type { SampleHierarchy } from "../sampleView/state/sampleState.js";
import type { ViewSelector } from "../sampleView/sampleViewTypes.d.ts";
import type { AgentProvenanceAction } from "../agent/agentContextTypes.d.ts";
import type App from "../app.js";

export interface AgentApi {
    getSampleHierarchy(): SampleHierarchy | undefined;
    getSampleAttributeInfo(
        attribute: AttributeIdentifier
    ): AttributeInfo | undefined;
    getSampleParamConfig(
        paramName: string
    ): { description?: string } | undefined;
    getSearchableViews(): unknown[];
    getViewRoot(): import("@genome-spy/core/view/view.js").default | undefined;
    resolveViewSelector(
        selector: ViewSelector
    ): import("@genome-spy/core/view/view.js").default | undefined;
    getActionHistory(): AgentProvenanceAction[];
    getPresentProvenanceState(): unknown | undefined;
    setViewVisibility(selector: ViewSelector, visibility: boolean): void;
    jumpToProvenanceState(provenanceId: string): boolean;
    jumpToInitialProvenanceState(): boolean;
    getAppContainer(): HTMLElement;
}
