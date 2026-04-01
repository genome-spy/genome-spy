import {
    AttributeIdentifier,
    AttributeIdentifierType,
} from "../sampleView/types.js";
import { ParamSelector } from "../sampleView/sampleViewTypes.js";

/**
 * Supported sample-action types that the agent is allowed to emit.
 *
 * This is the planner-facing subset of the sample collection reducer surface.
 */
export type AgentActionType =
    | "sortBy"
    | "filterByNominal"
    | "filterByQuantitative"
    | "groupByNominal"
    | "groupToQuartiles"
    | "groupByThresholds"
    | "retainFirstNCategories";

/**
 * Metadata for a single field in the generated agent action catalog.
 */
export interface AgentPayloadField {
    /**
     * Field name in the payload object.
     */
    name: string;

    /**
     * Human-readable type description used in docs and schemas.
     */
    type: string;

    /**
     * Short description of the field's meaning.
     */
    description: string;

    /**
     * Whether the field is required by the action.
     */
    required: boolean;
}

/**
 * A single action catalog entry exposed to the planner or local model.
 */
export interface AgentActionCatalogEntry {
    /**
     * Reducer/action name.
     */
    actionType: AgentActionType;

    /**
     * Short action summary.
     */
    description: string;

    /**
     * Payload type name used by the schema generator.
     */
    payloadType: string;

    /**
     * Longer payload description.
     */
    payloadDescription: string;

    /**
     * Field-level payload metadata.
     */
    payloadFields: AgentPayloadField[];

    /**
     * Minimal example payload.
     */
    examplePayload: Record<string, any>;
}

/**
 * High-level summary of a sample attribute that the agent can use to decide
 * how to filter, sort, or group.
 */
export interface AgentAttributeSummary {
    /**
     * Stable attribute identifier used by the action payloads.
     */
    id: AttributeIdentifier;

    /**
     * Attribute name in the current sample collection.
     */
    name: string;

    /**
     * Human-readable title.
     */
    title: string;

    /**
     * Attribute data type.
     */
    dataType: string;

    /**
     * Origin of the attribute, e.g. sample metadata or a view-backed field.
     */
    source: AttributeIdentifierType;

    /**
     * Whether the attribute is visible in the current UI.
     */
    visible: boolean;
}

/**
 * Compact summary of the currently loaded visualization.
 */
export interface AgentViewSummary {
    /**
     * High-level view type, e.g. sampleView.
     */
    type: string;

    /**
     * Internal view name.
     */
    name: string;

    /**
     * Human-readable title.
     */
    title: string;

    /**
     * Number of samples currently available.
     */
    sampleCount: number;

    /**
     * Number of metadata attributes currently available.
     */
    attributeCount: number;

    /**
     * Number of sample groups in the current hierarchy.
     */
    groupCount: number;
}

/**
 * Current value of a bookmarkable parameter or selection.
 */
export interface AgentParamSummary {
    /**
     * Stable key used to identify the parameter entry.
     */
    key: string;

    /**
     * Structured selector that identifies the parameter.
     */
    selector: ParamSelector;

    /**
     * Current value captured in provenance.
     */
    value: unknown;
}

/**
 * Bookmarkable provenance action exposed to the agent.
 */
export interface AgentProvenanceAction {
    /**
     * Human-readable summary of the action.
     */
    summary: string;

    /**
     * Redux action type.
     */
    type: string;

    /**
     * Serialized action payload.
     */
    payload?: unknown;

    /**
     * Optional Redux metadata.
     */
    meta?: unknown;

    /**
     * Optional Redux error flag.
     */
    error?: boolean;
}

/**
 * Declarative description of a structured view workflow that the planner can
 * request.
 */
export interface AgentViewWorkflowDefinition {
    /**
     * Workflow identifier.
     */
    workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";

    /**
     * Human-readable description.
     */
    description: string;

    /**
     * Slots that must be filled before the workflow can be resolved.
     */
    requiredSlots: string[];

    /**
     * The outputs this workflow can produce.
     */
    outputTargets: string[];
}

/**
 * Active interval selection summary used for selection-driven workflows.
 */
export interface AgentSelectionSummary {
    /**
     * Stable identifier derived from the selector.
     */
    id: string;

    /**
     * Selection kind. Currently only interval selections are surfaced.
     */
    type: "interval";

    /**
     * Human-readable label shown in clarification dialogs.
     */
    label: string;

    /**
     * Structured selector for the underlying parameter.
     */
    selector: ParamSelector;

    /**
     * Whether the selection is currently active.
     */
    active: boolean;

    /**
     * Compact suffix used when generating derived names.
     */
    nameSuffix: string;
}

/**
 * Static selection capability declared by the visualization spec.
 */
export interface AgentSelectionDeclaration {
    /**
     * Stable identifier derived from the parameter selector.
     */
    id: string;

    /**
     * Declared selection type.
     */
    selectionType: "point" | "interval";

    /**
     * Human-readable label for the parameter.
     */
    label: string;

    /**
     * Parameter name.
     */
    paramName: string;

    /**
     * Structured selector for the underlying parameter.
     */
    selector: ParamSelector;

    /**
     * Addressable view name.
     */
    view: string;

    /**
     * Human-readable view title.
     */
    viewTitle: string;

    /**
     * Whether the selection is persisted in bookmarks.
     */
    persist: boolean;

    /**
     * Whether the selection currently has an active value.
     */
    active: boolean;

    /**
     * Encodings that drive the selection, when explicitly declared.
     */
    encodings?: string[];

    /**
     * Whether point selection values toggle by default.
     */
    toggle?: boolean;

    /**
     * Whether the selection can be cleared.
     */
    clearable: boolean;
}

/**
 * Field inside a selected view that can be aggregated into a derived workflow.
 */
export interface AgentViewFieldSummary {
    /**
     * Stable identifier for the field summary.
     */
    id: string;

    /**
     * Addressable view name.
     */
    view: string;

    /**
     * Human-readable view title.
     */
    viewTitle: string;

    /**
     * Field name.
     */
    field: string;

    /**
     * Field data type.
     */
    dataType: string;

    /**
     * Active selections for which this field is relevant.
     */
    selectionIds: string[];

    /**
     * Supported aggregations for this field.
     */
    supportedAggregations: string[];
}

/**
 * View-workflow planning context derived from the current visualization.
 */
export interface AgentViewWorkflowContext {
    /**
     * Static selection declarations from the visualization spec.
     */
    selectionDeclarations: AgentSelectionDeclaration[];

    /**
     * Active interval selections.
     */
    selections: AgentSelectionSummary[];

    /**
     * Aggregatable fields for the active selections.
     */
    fields: AgentViewFieldSummary[];

    /**
     * Supported structured workflows.
     */
    workflows: AgentViewWorkflowDefinition[];
}

/**
 * Compact presentation metadata for an action.
 */
export interface AgentActionSummary {
    /**
     * Action type.
     */
    actionType: AgentActionType;

    /**
     * Short title used in menus.
     */
    title: string;

    /**
     * Action description.
     */
    description: string;
}

/**
 * Agent adapter API exposed to the UI and the embed entry point.
 */
export interface AgentAdapter {
    /**
     * Returns the current planner context snapshot.
     */
    getAgentContext(): AgentContext;

    /**
     * Validates a planner-authored intent program.
     */
    validateIntentProgram(program: unknown): IntentProgramValidationResult;

    /**
     * Submits a validated intent program for execution.
     */
    submitIntentProgram(
        program: IntentProgram
    ): Promise<IntentProgramExecutionResult>;

    /**
     * Summarizes an execution result for display.
     */
    summarizeExecutionResult(result: IntentProgramExecutionResult): string;

    /**
     * Requests a plan from the configured planner service.
     */
    requestPlan(
        message: string,
        history?: string[]
    ): Promise<{ response: PlanResponse; trace: Record<string, any> }>;

    /**
     * Starts the local prompt loop.
     */
    runLocalPrompt(): Promise<void>;
}

/**
 * Top-level context snapshot sent to the planner.
 */
export interface AgentContext {
    /**
     * Schema version for the planner context.
     */
    schemaVersion: 1;

    /**
     * Visualization summary.
     */
    view: AgentViewSummary;

    /**
     * Available attributes in the current sample collection.
     */
    attributes: AgentAttributeSummary[];

    /**
     * Agent-facing action catalog.
     */
    actionCatalog: AgentActionCatalogEntry[];

    /**
     * Human-readable action summaries.
     */
    actionSummaries: AgentActionSummary[];

    /**
     * Structured workflows that the agent can resolve locally.
     */
    viewWorkflows: AgentViewWorkflowContext;

    /**
     * Bookmarkable provenance actions for the current analysis history.
     */
    provenance: AgentProvenanceAction[];

    /**
     * Current bookmarkable params.
     */
    params: AgentParamSummary[];

    /**
     * Application lifecycle state.
     */
    lifecycle: {
        appInitialized: boolean;
    };
}

/**
 * One option presented during a clarification round.
 */
export interface ClarificationOption {
    /**
     * Stable value to return if the option is chosen.
     */
    value: string;

    /**
     * Human-readable label.
     */
    label: string;

    /**
     * Optional extra explanation.
     */
    description?: string;
}

/**
 * Request for additional user input when a plan cannot be resolved.
 */
export interface ClarificationRequest {
    /**
     * The workflow or planning context that needs clarification.
     */
    workflowKind: string;

    /**
     * The missing slot being clarified.
     */
    slot: string;

    /**
     * User-facing clarification text.
     */
    message: string;

    /**
     * Suggested choices.
     */
    options?: ClarificationOption[];

    /**
     * Whether free-text input is allowed.
     */
    allowFreeText?: boolean;

    /**
     * Suggested initial value.
     */
    initialValue?: string;

    /**
     * State to preserve across clarification rounds.
     */
    state: Record<string, any>;
}

/**
 * One step in a planner-authored intent program.
 */
export interface IntentProgramStep {
    /**
     * Action type to dispatch.
     */
    actionType: AgentActionType;

    /**
     * Payload for the action.
     */
    payload: Record<string, any>;
}

/**
 * Ordered list of actions proposed by the planner.
 */
export interface IntentProgram {
    /**
     * Schema version for the intent program.
     */
    schemaVersion: 1;

    /**
     * Ordered action steps.
     */
    steps: IntentProgramStep[];

    /**
     * Optional planner rationale.
     */
    rationale?: string;

    /**
     * Whether the program should be confirmed before execution.
     */
    needsConfirmation?: boolean;
}

/**
 * Result of validating an intent program against the current visualization.
 */
export interface IntentProgramValidationResult {
    /**
     * Whether validation succeeded.
     */
    ok: boolean;

    /**
     * Validation errors when `ok` is false.
     */
    errors: string[];

    /**
     * Normalized program when validation succeeds.
     */
    program?: IntentProgram;
}

/**
 * Result of executing a validated intent program.
 */
export interface IntentProgramExecutionResult {
    /**
     * Whether execution succeeded.
     */
    ok: boolean;

    /**
     * Number of executed actions.
     */
    executedActions: number;

    /**
     * Human-readable summaries of the executed steps.
     */
    summaries: string[];

    /**
     * Executed program.
     */
    program: IntentProgram;
}

/**
 * Request for resolving a structured view workflow.
 */
export interface ViewWorkflowRequest {
    /**
     * Workflow identifier.
     */
    workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";

    /**
     * Optional active selection id.
     */
    selectionId?: string;

    /**
     * Optional field id.
     */
    fieldId?: string;

    /**
     * Optional aggregation op.
     */
    aggregation?: string;

    /**
     * Desired output target.
     */
    outputTarget?: "sample_metadata" | "boxplot";

    /**
     * Optional derived name.
     */
    name?: string;

    /**
     * Optional group path for derived metadata.
     */
    groupPath?: string;

    /**
     * Optional scale payload for the workflow.
     */
    scale?: Record<string, any>;
}

/**
 * Normalized workflow after resolving selections and fields.
 */
export interface ResolvedViewWorkflow {
    /**
     * Workflow identifier.
     */
    workflowType: "deriveMetadataFromSelection" | "createBoxplotFromSelection";

    /**
     * Resolved selection.
     */
    selection: AgentSelectionSummary;

    /**
     * Resolved field.
     */
    field: AgentViewFieldSummary;

    /**
     * Resolved aggregation.
     */
    aggregation: string;

    /**
     * Final output target.
     */
    outputTarget: "sample_metadata" | "boxplot";

    /**
     * Optional derived name.
     */
    name?: string;

    /**
     * Optional group path.
     */
    groupPath?: string;

    /**
     * Optional scale payload.
     */
    scale?: Record<string, any>;
}

/**
 * One step in a mixed agent program.
 */
export type AgentProgramStep =
    | {
          type: "intent_program";
          program: IntentProgram;
      }
    | {
          type: "view_workflow";
          workflow: ViewWorkflowRequest;
      };

/**
 * Mixed structured program that can combine generic intents and local
 * view-workflow resolution.
 */
export interface AgentProgram {
    /**
     * Schema version for mixed agent programs.
     */
    schemaVersion: 1;

    /**
     * Ordered steps.
     */
    steps: AgentProgramStep[];

    /**
     * Optional planner rationale.
     */
    rationale?: string;

    /**
     * Whether to ask for confirmation before execution.
     */
    needsConfirmation?: boolean;
}

/**
 * Result shape used by resolvers that may need clarification.
 */
export type ResolverResult<T> =
    | { status: "not_applicable" }
    | { status: "resolved"; value: T }
    | { status: "needs_clarification"; request: ClarificationRequest }
    | { status: "error"; message: string };

/**
 * Top-level response returned by the planner endpoint.
 */
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
