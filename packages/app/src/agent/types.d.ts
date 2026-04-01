import { AttributeIdentifier } from "../sampleView/types.js";

export type AgentActionType =
    | "sortBy"
    | "filterByNominal"
    | "filterByQuantitative"
    | "groupByNominal"
    | "groupToQuartiles"
    | "groupByThresholds"
    | "retainFirstNCategories";

export interface AgentPayloadField {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

export interface AgentActionCatalogEntry {
    actionType: AgentActionType;
    description: string;
    payloadType: string;
    payloadDescription: string;
    payloadFields: AgentPayloadField[];
    examplePayload: Record<string, any>;
}

export interface AgentAttributeSummary {
    id: AttributeIdentifier;
    name: string;
    title: string;
    dataType: string;
    source: string;
    visible: boolean;
}

export interface AgentViewSummary {
    type: string;
    name: string;
    title: string;
    sampleCount: number;
    attributeCount: number;
    groupCount: number;
}

export interface AgentParamSummary {
    key: string;
    selector: any;
    value: any;
}

export interface AgentViewWorkflowDefinition {
    workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";
    description: string;
    requiredSlots: string[];
    outputTargets: string[];
}

export interface AgentSelectionSummary {
    id: string;
    type: "interval";
    label: string;
    selector: any;
    active: boolean;
    nameSuffix: string;
}

export interface AgentViewFieldSummary {
    id: string;
    view: string;
    viewTitle: string;
    field: string;
    dataType: string;
    selectionIds: string[];
    supportedAggregations: string[];
}

export interface AgentViewWorkflowContext {
    selections: AgentSelectionSummary[];
    fields: AgentViewFieldSummary[];
    workflows: AgentViewWorkflowDefinition[];
}

export interface AgentContext {
    schemaVersion: 1;
    view: AgentViewSummary;
    attributes: AgentAttributeSummary[];
    actionCatalog: AgentActionCatalogEntry[];
    viewWorkflows: AgentViewWorkflowContext;
    provenance: string[];
    params: AgentParamSummary[];
    lifecycle: {
        appInitialized: boolean;
    };
}

export interface ClarificationOption {
    value: string;
    label: string;
    description?: string;
}

export interface ClarificationRequest {
    workflowKind: string;
    slot: string;
    message: string;
    options?: ClarificationOption[];
    allowFreeText?: boolean;
    initialValue?: string;
    state: Record<string, any>;
}

export interface IntentProgramStep {
    actionType: AgentActionType;
    payload: Record<string, any>;
}

export interface IntentProgram {
    schemaVersion: 1;
    steps: IntentProgramStep[];
    rationale?: string;
    needsConfirmation?: boolean;
}

export interface IntentProgramValidationResult {
    ok: boolean;
    errors: string[];
    program?: IntentProgram;
}

export interface IntentProgramExecutionResult {
    ok: boolean;
    executedActions: number;
    summaries: string[];
    program: IntentProgram;
}

export interface ViewWorkflowRequest {
    workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";
    selectionId?: string;
    fieldId?: string;
    aggregation?: string;
    outputTarget?: "sample_metadata" | "boxplot";
    name?: string;
    groupPath?: string;
    scale?: Record<string, any>;
}

export interface ResolvedViewWorkflow {
    workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";
    selection: AgentSelectionSummary;
    field: AgentViewFieldSummary;
    aggregation: string;
    outputTarget: "sample_metadata" | "boxplot";
    name?: string;
    groupPath?: string;
    scale?: Record<string, any>;
}

export type AgentProgramStep =
    | {
          type: "intent_program";
          program: IntentProgram;
      }
    | {
          type: "view_workflow";
          workflow: ViewWorkflowRequest;
      };

export interface AgentProgram {
    schemaVersion: 1;
    steps: AgentProgramStep[];
    rationale?: string;
    needsConfirmation?: boolean;
}

export type ResolverResult<T> =
    | { status: "not_applicable" }
    | { status: "resolved"; value: T }
    | { status: "needs_clarification"; request: ClarificationRequest }
    | { status: "error"; message: string };

export type PlanResponse =
    | {
          type: "clarify" | "answer";
          message: string;
      }
    | {
          type: "intent_program";
          program: IntentProgram;
      }
    | {
          type: "view_workflow";
          workflow: ViewWorkflowRequest;
      }
    | {
          type: "agent_program";
          program: AgentProgram;
      };
