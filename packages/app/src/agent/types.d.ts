import {
    AttributeIdentifier,
    AttributeIdentifierType,
} from "../sampleView/types.js";
import { ParamSelector } from "../sampleView/sampleViewTypes.js";
import type {
    AgentActionType as GeneratedAgentActionType,
    AgentIntentProgramStep as GeneratedAgentIntentProgramStep,
} from "./generatedActionTypes.js";
import type { ViewSelector } from "@genome-spy/core/view/viewSelectors.js";
import type { ParamValue } from "../state/paramProvenanceTypes.d.ts";

export type AgentActionType = GeneratedAgentActionType;

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
    examplePayload: unknown;
}

/**
 * Compact tool catalog entry exposed to the planner.
 */
export interface AgentToolCatalogEntry {
    /**
     * Stable tool name.
     */
    toolName: string;

    /**
     * User-facing tool description.
     */
    description: string;

    /**
     * Payload type name used by the schema generator.
     */
    inputType: string;

    /**
     * Field-level input metadata.
     */
    inputFields: AgentPayloadField[];

    /**
     * Minimal example payload.
     */
    exampleInput: unknown;
}

/**
 * One tool invocation requested by the planner.
 */
export interface AgentToolCall {
    /**
     * Stable call identifier returned by the provider.
     */
    callId: string;

    /**
     * Tool name.
     */
    name: string;

    /**
     * Parsed tool arguments.
     */
    arguments: unknown;
}

/**
 * Compact action catalog entry sent in the planner context.
 */
export interface AgentActionCatalogContextEntry {
    /**
     * Reducer/action name.
     */
    actionType: AgentActionType;

    /**
     * Short action summary.
     */
    description: string;

    /**
     * Field-level payload metadata.
     */
    payloadFields: AgentPayloadField[];

    /**
     * Minimal example payload.
     */
    examplePayload: unknown;
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
     * Human-readable description of the attribute, if available.
     */
    description?: string;

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
    visible?: boolean;
}

/**
 * Compact summary of the loaded sample collection.
 */
export interface AgentSampleSummary {
    /**
     * Number of samples currently available.
     */
    sampleCount: number;

    /**
     * Number of sample groups in the current hierarchy.
     */
    groupCount: number;
}

/**
 * Summary of a root-level visualization config that helps the agent interpret
 * the view hierarchy.
 */
export interface AgentRootConfigSummary {
    /**
     * Default assembly used for locus scales.
     */
    assembly?: string;

    /**
     * Base URL inherited by relative data sources.
     */
    baseUrl?: string;

    /**
     * Named genomes available to the visualization.
     */
    genomes?: string[];

    /**
     * Named datasets available to the visualization.
     */
    datasets?: string[];
}

/**
 * Summary of a data source used by a view node.
 */
export interface AgentViewDataSummary {
    /**
     * Data source kind.
     */
    kind:
        | "url"
        | "inline"
        | "named"
        | "generator"
        | "lazy"
        | "callback"
        | "other";

    /**
     * Compact source identifier or URL.
     */
    source: string;

    /**
     * Parsed data format, when relevant.
     */
    format?: string;

    /**
     * Human-readable description of the data source, if available.
     */
    description?: string;
}

/**
 * Summary of an effective encoding channel in the view hierarchy.
 */
export interface AgentViewEncodingSummary {
    /**
     * Source kind used by the encoding.
     */
    sourceKind?: "field" | "expr" | "datum";

    /**
     * Field bound to the channel, if any.
     */
    field?: string;

    /**
     * Expression bound to the channel, if any.
     */
    expr?: string;

    /**
     * Datum bound to the channel, if any.
     */
    datum?: unknown;

    /**
     * Value type or data type carried by the channel.
     */
    type?: string;

    /**
     * Channel title, if explicitly set.
     */
    title?: string;

    /**
     * Human-readable description of the channel mapping, if available.
     */
    description?: string;

    /**
     * Whether this encoding comes from an ancestor view.
     */
    inherited: boolean;
}

/**
 * Summary of a view node in the normalized agent-facing view tree.
 */
export type AgentViewEncodings = Record<string, AgentViewEncodingSummary>;

/**
 * Summary of a view node in the normalized agent-facing view tree.
 */
export interface AgentViewNode {
    /**
     * Normalized view type derived from the underlying spec.
     */
    type: string;

    /**
     * Stable view name, if available.
     */
    name?: string;

    /**
     * Human-readable title.
     */
    title: string;

    /**
     * Human-readable description of the node's semantic purpose.
     */
    description: string;

    /**
     * Stable view selector used for provenance-safe addressing.
     */
    selector?: ViewSelector;

    /**
     * Mark type used by unit-like nodes.
     */
    markType?: string;

    /**
     * Whether the view is currently visible according to the app state.
     */
    visible?: boolean;

    /**
     * Whether the node is a compressed hidden branch rather than a fully
     * expanded subtree.
     */
    collapsed?: boolean;

    /**
     * Number of immediate child views represented by a collapsed branch.
     */
    childCount?: number;

    /**
     * Data source summary, if explicitly declared at this node.
     */
    data?: AgentViewDataSummary;

    /**
     * Effective encodings for the node.
     */
    encodings?: AgentViewEncodings;

    /**
     * Adjustable parameter declarations attached to the node.
     */
    parameterDeclarations?: AgentParameterDeclaration[];

    /**
     * Child nodes in the view hierarchy.
     */
    children?: AgentViewNode[];
}

/**
 * Summary of the visualization's root config.
 */
export interface AgentViewTreeRoot {
    /**
     * Root-level configuration summary.
     */
    rootConfig?: AgentRootConfigSummary;

    /**
     * Root node of the view hierarchy.
     */
    root: AgentViewNode;
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
     * Human-readable description of the active selection, if available.
     */
    description?: string;

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
 * Summary of a bind used by an adjustable variable parameter.
 */
export interface AgentParameterBindSummary {
    /**
     * Input type used by the bind.
     */
    input:
        | "checkbox"
        | "radio"
        | "range"
        | "select"
        | "text"
        | "number"
        | "color";

    /**
     * Optional label override shown in the UI.
     */
    label: string;

    /**
     * Optional description or help text.
     */
    description?: string;

    /**
     * Optional debounce delay in milliseconds.
     */
    debounce?: number;

    /**
     * Minimum value for range inputs.
     */
    min?: number;

    /**
     * Maximum value for range inputs.
     */
    max?: number;

    /**
     * Step size for range inputs.
     */
    step?: number;

    /**
     * Available options for radio and select inputs.
     */
    options?: unknown[];

    /**
     * Labels for radio and select options.
     */
    labels?: string[];

    /**
     * Placeholder text for text and number inputs.
     */
    placeholder?: string;

    /**
     * Autocomplete hint for text inputs.
     */
    autocomplete?: string;
}

/**
 * Shared metadata for an adjustable parameter.
 */
export interface AgentParameterDeclarationBase {
    /**
     * Human-readable label for the parameter.
     */
    label: string;

    /**
     * Human-readable description of the parameter, if available.
     */
    description?: string;

    /**
     * Current runtime value, if available.
     */
    value?: ParamValue;

    /**
     * Structured selector for the underlying parameter.
     */
    selector: ParamSelector;

    /**
     * Whether the parameter is persisted in bookmarks.
     */
    persist: boolean;
}

/**
 * Static selection capability declared by the visualization spec.
 */
export interface AgentSelectionParameterDeclaration extends AgentParameterDeclarationBase {
    /**
     * Parameter kind.
     */
    parameterType: "selection";

    /**
     * Declared selection type.
     */
    selectionType: "point" | "interval";

    /**
     * Encodings that drive the selection, when explicitly declared.
     */
    encodings?: string[];

    /**
     * Whether the selection can be cleared.
     */
    clearable: boolean;
}

/**
 * Adjustable variable parameter bound to an input control.
 */
export interface AgentVariableParameterDeclaration extends AgentParameterDeclarationBase {
    /**
     * Parameter kind.
     */
    parameterType: "variable";

    /**
     * Summarized input binding.
     */
    bind: AgentParameterBindSummary;
}

/**
 * Adjustable parameter declared by the visualization spec.
 */
export type AgentParameterDeclaration =
    | AgentSelectionParameterDeclaration
    | AgentVariableParameterDeclaration;

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
     * Human-readable description of the field, if available.
     */
    description?: string;

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
 * Planner-facing workflow context. Field lists are omitted when there are no
 * active selection-driven fields.
 */
export interface AgentPlannerViewWorkflowContext {
    /**
     * Supported structured workflows.
     */
    workflows: AgentViewWorkflowDefinition[];

    /**
     * Aggregatable fields for the active selections, if any.
     */
    fields?: AgentViewFieldSummary[];
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
 * Renderable summary line for a planner-authored intent step.
 */
export interface IntentProgramSummaryLine {
    /**
     * Renderable content for chat or dialog UIs.
     */
    content: string | import("lit").TemplateResult;

    /**
     * Plain-text fallback for logs and exports.
     */
    text: string;
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
     * Changes the configured visibility of a view.
     */
    setViewVisibility(selector: ViewSelector, visibility: boolean): void;

    /**
     * Clears the configured visibility override for a view.
     */
    clearViewVisibility(selector: ViewSelector): void;

    /**
     * Summarizes an execution result for display.
     */
    summarizeExecutionResult(result: IntentProgramExecutionResult): string;

    /**
     * Summarizes a planner-authored intent program for preview.
     */
    summarizeIntentProgram(program: IntentProgram): IntentProgramSummaryLine[];

    /**
     * Requests a plan from the configured planner service.
     */
    requestPlan(
        message: string,
        history?: AgentConversationMessage[],
        streamCallbacks?: AgentStreamCallbacks,
        allowStreaming?: boolean,
        contextOptions?: AgentContextOptions
    ): Promise<{ response: PlanResponse; trace: Record<string, any> }>;

    /**
     * Starts the local prompt loop.
     */
    runLocalPrompt(): Promise<void>;
}

/**
 * Stream callbacks for the active agent turn.
 */
export interface AgentStreamCallbacks {
    /**
     * Receives visible text chunks.
     */
    onDelta?(delta: string): void;

    /**
     * Receives reasoning-summary chunks when the provider exposes them.
     */
    onReasoning?(delta: string): void;

    /**
     * Receives periodic progress pulses while the request stays active.
     */
    onHeartbeat?(): void;
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
     * Sample-collection summary.
     */
    sampleSummary: AgentSampleSummary;

    /**
     * Root node of the normalized view hierarchy snapshot.
     */
    viewRoot: AgentViewNode;

    /**
     * Available attributes in the current sample collection.
     */
    attributes: AgentAttributeSummary[];

    /**
     * Agent-facing action catalog.
     */
    actionCatalog: AgentActionCatalogContextEntry[];

    /**
     * Available tools exposed to the planner.
     */
    toolCatalog: AgentToolCatalogEntry[];

    /**
     * Structured workflows that the agent can resolve locally.
     */
    viewWorkflows: AgentPlannerViewWorkflowContext;

    /**
     * Bookmarkable provenance actions for the current analysis history.
     */
    provenance: AgentProvenanceAction[];

    /**
     * Application lifecycle state.
     */
    lifecycle: {
        appInitialized: boolean;
    };
}

/**
 * Optional context overlay used while building the planner snapshot.
 */
export interface AgentContextOptions {
    /**
     * Stable view selector keys that should remain expanded in the tree.
     */
    expandedViewNodeKeys?: string[];
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
 * Conversation turn sent to the planner service.
 */
export interface AgentConversationMessage {
    /**
     * Stable message identifier.
     */
    id: string;

    /**
     * Transcript role.
     */
    role: "user" | "assistant" | "tool";

    /**
     * Message text content.
     */
    text: string;

    /**
     * Optional kind for non-standard assistant turns.
     */
    kind?: "clarification" | "tool_call" | "tool_result";

    /**
     * Tool calls attached to an assistant tool-request turn.
     */
    toolCalls?: AgentToolCall[];

    /**
     * Tool call identifier for tool result turns.
     */
    toolCallId?: string;

    /**
     * Optional structured content for tool result turns.
     */
    content?: unknown;
}

export type AgentIntentProgramStep = GeneratedAgentIntentProgramStep;

/**
 * Backward-compatible alias for intent program steps.
 */
export type IntentProgramStep = AgentIntentProgramStep;

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
    steps: AgentIntentProgramStep[];

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
 * Result of validating a planner-authored schema against the generated agent
 * contract.
 */
export interface ShapeValidationResult {
    /**
     * Whether validation succeeded.
     */
    ok: boolean;

    /**
     * Validation errors when `ok` is false.
     */
    errors: string[];
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
    summaries: IntentProgramSummaryLine[];

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
 * Resolver result used by view-workflow helpers.
 */
export type WorkflowResolverResult<T> =
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
          type: "tool_call";
          toolCalls: AgentToolCall[];
          message?: string;
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
