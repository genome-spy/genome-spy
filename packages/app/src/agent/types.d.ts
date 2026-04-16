import type { AttributeIdentifier } from "../sampleView/types.d.ts";
import type { ViewSelector } from "../sampleView/sampleViewTypes.d.ts";
import type {
    AgentAttributeSummary,
    AgentGroupedMetadataAttributeSummarySource,
    AgentMetadataAttributeSummarySource,
    AgentProvenanceAction,
    AgentSampleGroupLevel,
    AgentSampleSummary,
    AgentSearchableViewSummary,
    AgentSelectionAggregationContext,
    AgentViewNode,
    IntentBatchExecutionContent,
    IntentBatchSummaryLine,
} from "./agentContextTypes.d.ts";
import type {
    AgentActionType as GeneratedAgentActionType,
    AgentIntentBatchStep as GeneratedAgentIntentBatchStep,
} from "./generated/generatedActionTypes.js";

export type {
    AgentAttributeSummary,
    AgentGroupedMetadataAttributeSummarySource,
    AgentMetadataAttributeSummarySource,
    AgentProvenanceAction,
    AgentRootConfigSummary,
    AgentSampleGroupLevel,
    AgentSampleSummary,
    AgentSearchableFieldSummary,
    AgentSearchableViewDatumLookupResult,
    AgentSearchableViewSummary,
    AgentSelectionAggregationContext,
    AgentSelectionSummary,
    AgentViewDataSummary,
    AgentViewEncodingSummary,
    AgentViewEncodings,
    AgentViewFieldSummary,
    AgentViewNode,
    AgentViewScaleSummary,
    AgentViewTreeRoot,
    AgentVisibleSampleGroupSource,
    AgentParameterBindSummary,
    AgentParameterDeclarationBase,
    AgentParameterDeclaration,
    AgentSelectionParameterDeclaration,
    AgentVariableParameterDeclaration,
    IntentBatchExecutionContent,
    IntentBatchExecutionSampleViewSummary,
    IntentBatchSummaryLine,
    SelectionAggregationResolution,
} from "./agentContextTypes.d.ts";

export type AgentActionType = GeneratedAgentActionType;
export type IntentSubmissionKind = "user" | "agent" | "bookmark";

/**
 * Metadata for a single field in the generated agent action catalog.
 */
export interface AgentPayloadField {
    /** Field name in the payload object. */
    name: string;

    /** Human-readable type description used in docs and schemas. */
    type: string;

    /** Short description of the field's meaning. */
    description: string;

    /** Whether the field is required by the action. */
    required: boolean;
}

/**
 * A single action catalog entry exposed to the agent or local model.
 */
export interface AgentActionCatalogEntry {
    /** Reducer/action name. */
    actionType: AgentActionType;

    /** Short action summary. */
    description: string;

    /** Payload type name used by the schema generator. */
    payloadType: string;

    /** Field-level payload metadata. */
    payloadFields: AgentPayloadField[];

    /** Minimal example payload. */
    examplePayload: unknown;
}

/**
 * Compact tool catalog entry exposed to the agent.
 */
export interface AgentToolCatalogEntry {
    /** Stable tool name. */
    toolName: string;

    /** User-facing tool description. */
    description: string;

    /** Payload type name used by the schema generator. */
    inputType: string;

    /** Field-level input metadata. */
    inputFields: AgentPayloadField[];

    /** Minimal example payload. */
    exampleInput: unknown;

    /** Whether the Responses API function tool should run in strict mode. */
    strict?: boolean;
}

/** One tool invocation requested by the agent. */
export interface AgentToolCall {
    /** Stable call identifier returned by the provider. */
    callId: string;

    /** Tool name. */
    name: string;

    /** Parsed tool arguments. */
    arguments: unknown;
}

/** Structured summary for a view-state mutation performed by an agent tool. */
export interface AgentViewStateChange {
    kind: "view_state_change";
    domain: "agent_context" | "user_visibility";
    field: "collapsed" | "visible";
    selector: ViewSelector;
    before: boolean;
    after: boolean;
    changed: boolean;
}

/** Compact action catalog entry sent in the agent context. */
export interface AgentActionCatalogContextEntry {
    actionType: AgentActionType;
    description: string;
    payloadFields: AgentPayloadField[];
    examplePayload: unknown;
}

/** Compact presentation metadata for an action. */
export interface AgentActionSummary {
    actionType: AgentActionType;
    title: string;
    description: string;
}

/** Agent adapter API exposed to the UI and the embed entry point. */
export interface AgentAdapter {
    getAgentContext(contextOptions?: AgentContextOptions): AgentContext;
    validateIntentBatch(batch: unknown): IntentBatchValidationResult;
    submitIntentActions(
        batch: IntentBatch,
        options?: { submissionKind?: IntentSubmissionKind }
    ): Promise<IntentBatchExecutionResult>;
    resolveViewSelector(
        selector: ViewSelector
    ): import("@genome-spy/core/view/view.js").default | undefined;
    setViewVisibility(selector: ViewSelector, visibility: boolean): void;
    clearViewVisibility(selector: ViewSelector): void;
    getMetadataAttributeSummarySource(
        attribute: AttributeIdentifier
    ): AgentMetadataAttributeSummarySource | undefined;
    getGroupedMetadataAttributeSummarySource(
        attribute: AttributeIdentifier
    ): AgentGroupedMetadataAttributeSummarySource | undefined;
    jumpToProvenanceState(provenanceId: string): boolean;
    jumpToInitialProvenanceState(): boolean;
    summarizeExecutionResult(result: IntentBatchExecutionResult): string;
    summarizeProvenanceActionsSince(
        startIndex: number
    ): IntentBatchSummaryLine[];
    requestAgentTurn(
        message: string,
        history?: AgentConversationMessage[],
        streamCallbacks?: AgentStreamCallbacks,
        allowStreaming?: boolean,
        contextOptions?: AgentContextOptions,
        signal?: AbortSignal
    ): Promise<{ response: AgentTurnResponse; trace: Record<string, any> }>;
}

/** Stream callbacks for the active agent turn. */
export interface AgentStreamCallbacks {
    onDelta?(delta: string): void;
    onReasoning?(delta: string): void;
    onHeartbeat?(): void;
}

/** Top-level context snapshot sent to the agent. */
export interface AgentContext {
    schemaVersion: 1;
    actionCatalog: AgentActionCatalogContextEntry[];
    toolCatalog: AgentToolCatalogEntry[];
    attributes: AgentAttributeSummary[];
    searchableViews: AgentSearchableViewSummary[];
    selectionAggregation: AgentSelectionAggregationContext;
    provenance: AgentProvenanceAction[];
    sampleSummary: AgentSampleSummary;
    sampleGroupLevels: AgentSampleGroupLevel[];
    viewRoot: AgentViewNode;
}

/** Optional context overlay used while building the agent snapshot. */
export interface AgentContextOptions {
    expandedViewNodeKeys?: string[];
}

/** One option presented during a clarification round. */
export interface ClarificationOption {
    value: string;
    label: string;
    description?: string;
}

/** Request for additional user input when a response cannot be resolved. */
export interface ClarificationRequest {
    workflowKind: string;
    slot: string;
    message: string;
    options?: ClarificationOption[];
    allowFreeText?: boolean;
    initialValue?: string;
    state: Record<string, any>;
}

/** Conversation turn sent to the agent service. */
export interface AgentConversationMessage {
    id: string;
    role: "user" | "assistant" | "tool";
    text: string;
    kind?: "clarification" | "tool_call" | "tool_result";
    toolCalls?: AgentToolCall[];
    toolCallId?: string;
    content?: unknown;
}

export type AgentIntentBatchStep = GeneratedAgentIntentBatchStep;

/** Backward-compatible alias for intent batch steps. */
export type IntentBatchStep = AgentIntentBatchStep;

/** Ordered list of actions proposed by the agent. */
export interface IntentBatch {
    schemaVersion: 1;
    steps: AgentIntentBatchStep[];
    rationale?: string;
}

/** Result of validating an agent-authored schema against the generated agent contract. */
export interface ShapeValidationResult {
    ok: boolean;
    errors: string[];
}

/** Result of validating an intent batch against the current visualization. */
export interface IntentBatchValidationResult {
    ok: boolean;
    errors: string[];
    batch?: IntentBatch;
}

/** Result of executing a validated intent batch. */
export interface IntentBatchExecutionResult {
    ok: boolean;
    executedActions: number;
    content: IntentBatchExecutionContent;
    summaries: IntentBatchSummaryLine[];
    batch: IntentBatch;
}

/** Result shape used by resolvers that may need clarification. */
export type ResolverResult<T> =
    | { status: "not_applicable" }
    | { status: "resolved"; value: T }
    | { status: "needs_clarification"; request: ClarificationRequest }
    | { status: "error"; message: string };

/** Top-level response returned by the agent-turn endpoint. */
export type AgentTurnResponse =
    | {
          type: "clarify" | "answer";
          message: string;
      }
    | {
          type: "tool_call";
          toolCalls: AgentToolCall[];
          message?: string;
      }
    | never;
