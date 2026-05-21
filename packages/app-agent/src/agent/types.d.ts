import type {
    AttributeIdentifier,
    ViewSelector,
} from "@genome-spy/app/agentShared";
import type {
    AgentAttributeSummary,
    AgentGroupedAttributeSummarySource,
    AgentAttributeSummarySource,
    AgentProvenanceAction,
    AgentSampleGroupLevel,
    AgentSampleSummary,
    AgentScaleDomainSummary,
    AgentSearchableViewSummary,
    AgentSelectionAggregationContext,
    AgentParameterValueSummary,
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
    AgentGroupedAttributeSummarySource,
    AgentAttributeSummarySource,
    AgentRootConfigSummary,
    AgentSampleGroupLevel,
    AgentSampleSummary,
    AgentScaleDomainSummary,
    AgentSearchableFieldSummary,
    AgentSearchableViewDatumLookupResult,
    AgentSearchableViewSummary,
    AgentSelectionAggregationContext,
    AgentSelectionSummary,
    AgentProvenanceAction,
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
    AgentParameterValueSummary,
    AgentSelectionParameterDeclaration,
    AgentVariableParameterDeclaration,
    IntentBatchExecutionContent,
    IntentBatchExecutionNote,
    IntentBatchExecutionSampleViewSummary,
    IntentBatchSummaryLine,
    SelectionAggregationResolution,
} from "./agentContextTypes.d.ts";

export type AgentActionType = GeneratedAgentActionType;
export type IntentSubmissionKind = "user" | "agent" | "bookmark";

/** Metadata for a single generated catalog field. */
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
 * Metadata for a single field in the generated agent action catalog.
 */
export interface AgentActionPayloadField extends AgentPayloadField {
    /**
     * Queryable type names referenced by `type`.
     *
     * Primitive display types have an empty array. Wrapper expressions such as
     * `[Threshold, ...Threshold[]]` reference their inner named types.
     */
    typeRefs: string[];
}

/**
 * A single action catalog entry exposed to the agent or local model.
 */
export interface AgentActionCatalogEntry {
    /** Reducer/action name. */
    actionType: AgentActionType;

    /** Short action summary. */
    description: string;

    /** Optional usage guidance for choosing and applying the action. */
    usage?: string;

    /** Payload type name used by the schema generator. */
    payloadType: string;

    /** Field-level payload metadata. */
    payloadFields: AgentActionPayloadField[];

    /** Attribute data types accepted by actions that operate on an attribute. */
    attributeKinds?: string[];

    /** Minimal example payload. */
    examplePayload: unknown;

    /** Example payloads parsed from reducer JSDoc. */
    examples: unknown[];
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

/**
 * Provider-ready function tool definition sent to the relay.
 */
export interface AgentProviderToolDefinition {
    /** OpenAI Responses API tool kind. */
    type: "function";

    /** Stable tool name. */
    name: string;

    /** User-facing tool description. */
    description: string;

    /** JSON Schema for the tool arguments. */
    parameters: Record<string, any>;

    /** Whether the provider should enforce strict argument matching. */
    strict: boolean;
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

/** Compact presentation metadata for an action. */
export interface AgentActionSummary {
    actionType: AgentActionType;
    title: string;
    description: string;
}

/** Compact intent action summary sent in the agent context. */
export interface AgentIntentActionSummary {
    actionType: AgentActionType;
    description: string;
}

/** Agent adapter API exposed to the UI and the embed entry point. */
export interface AgentAdapter {
    agentApi: import("@genome-spy/app/agentApi").AgentApi;

    getAgentContext(contextOptions?: AgentContextOptions): AgentContext;
    getAgentVolatileContext(): AgentVolatileContext;
    submitIntentActions(
        batch: IntentBatch,
        options?: { submissionKind?: IntentSubmissionKind }
    ): Promise<IntentBatchExecutionResult>;
    getAttributeSummarySource(
        attribute: AttributeIdentifier
    ): AgentAttributeSummarySource | undefined;
    getGroupedAttributeSummarySource(
        attribute: AttributeIdentifier
    ): AgentGroupedAttributeSummarySource | undefined;
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
    intentActionSummaries: AgentIntentActionSummary[];
    attributes: AgentAttributeSummary[];
    searchableViews: AgentSearchableViewSummary[];
    viewRoot: AgentViewNode;
}

/** High-churn context sent late in the provider prompt for the current turn. */
export interface AgentVolatileContext {
    sampleSummary: AgentSampleSummary;
    sampleGroupLevels: AgentSampleGroupLevel[];
    parameterValues: AgentParameterValueSummary[];
    scaleDomains: AgentScaleDomainSummary[];
    selectionAggregation: AgentSelectionAggregationContext;
    activeProvenanceState?: Pick<
        AgentProvenanceAction,
        "provenanceId" | "summary" | "type"
    >;
    provenance: AgentProvenanceAction[];
}

/** Browser turn request sent to the agent server. */
export interface AgentTurnRequest {
    message: string;
    history: AgentConversationMessage[];
    context: AgentContext;
    volatileContext: AgentVolatileContext;
    tools: AgentProviderToolDefinition[];
}

/** Optional context overlay used while building the agent snapshot. */
export interface AgentContextOptions {
    expandedViewNodeKeys?: string[];
}

/** Conversation turn sent to the agent service. */
export interface AgentConversationMessage {
    id: string;
    role: "user" | "assistant" | "tool";
    text: string;
    phase?: "commentary" | "final_answer";
    kind?: "tool_call" | "tool_result";
    toolCalls?: AgentToolCall[];
    toolCallId?: string;
    rejected?: boolean;
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

/** Result shape used by resolvers. */
export type ResolverResult<T> =
    | { status: "not_applicable" }
    | { status: "resolved"; value: T }
    | { status: "error"; message: string };

/** Top-level response returned by the agent-turn endpoint. */
export type AgentTurnResponse =
    | {
          type: "answer";
          message: string;
      }
    | {
          type: "tool_call";
          toolCalls: AgentToolCall[];
          message?: string;
      }
    | never;
