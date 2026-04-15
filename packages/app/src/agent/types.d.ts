import {
    AttributeIdentifier,
    AttributeIdentifierType,
} from "../sampleView/types.js";
import { ParamSelector } from "../sampleView/sampleViewTypes.js";
import type { AggregationOp } from "../sampleView/types.d.ts";
import type {
    AgentActionType as GeneratedAgentActionType,
    AgentIntentBatchStep as GeneratedAgentIntentBatchStep,
} from "./generated/generatedActionTypes.js";
import type { ViewSelector } from "@genome-spy/core/view/viewSelectors.js";
import type { ParamValue } from "../state/paramProvenanceTypes.d.ts";

export type AgentActionType = GeneratedAgentActionType;
export type IntentSubmissionKind = "user" | "agent" | "bookmark";

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
 * A single action catalog entry exposed to the agent or local model.
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
     * Field-level payload metadata.
     */
    payloadFields: AgentPayloadField[];

    /**
     * Minimal example payload.
     */
    examplePayload: unknown;
}

/**
 * Compact tool catalog entry exposed to the agent.
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

    /**
     * Whether the Responses API function tool should run in strict mode.
     */
    strict?: boolean;
}

/**
 * One tool invocation requested by the agent.
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
 * Runtime source used by the metadata summary tool.
 */
export interface AgentMetadataAttributeSummarySource {
    /**
     * Stable identifier of the metadata attribute.
     */
    attribute: AttributeIdentifier;

    /**
     * User-visible title for the attribute.
     */
    title: string;

    /**
     * Human-readable description of the attribute, if available.
     */
    description?: string;

    /**
     * Current metadata data type.
     */
    dataType: string;

    /**
     * Summary scope represented by the aligned sample ids.
     */
    scope: "visible_samples";

    /**
     * Sample ids covered by the summary scope.
     */
    sampleIds: string[];

    /**
     * Raw values aligned with `sampleIds`.
     */
    values: unknown[];
}

/**
 * One visible leaf group used by the grouped metadata summary tool.
 */
export interface AgentVisibleSampleGroupSource {
    /**
     * Stable path of group names from the visible hierarchy root.
     */
    path: string[];

    /**
     * Human-readable titles along the same visible group path.
     */
    titles: string[];

    /**
     * User-visible title for the leaf group.
     */
    title: string;

    /**
     * Sample ids currently present in this visible leaf group.
     */
    sampleIds: string[];
}

/**
 * Runtime source used by the grouped metadata summary tool.
 */
export interface AgentGroupedMetadataAttributeSummarySource {
    /**
     * Stable identifier of the metadata attribute.
     */
    attribute: AttributeIdentifier;

    /**
     * User-visible title for the attribute.
     */
    title: string;

    /**
     * Human-readable description of the attribute, if available.
     */
    description?: string;

    /**
     * Current metadata data type.
     */
    dataType: string;

    /**
     * Summary scope represented by the visible groups.
     */
    scope: "visible_groups";

    /**
     * Active grouping levels in the visible hierarchy.
     */
    groupLevels: AgentSampleGroupLevel[];

    /**
     * Visible leaf groups in the current hierarchy.
     */
    groups: AgentVisibleSampleGroupSource[];

    /**
     * Metadata values keyed by sample id.
     */
    valuesBySampleId: Record<string, unknown>;
}

/**
 * Structured summary for a view-state mutation performed by an agent tool.
 */
export interface AgentViewStateChange {
    /**
     * Content discriminator.
     */
    kind: "view_state_change";

    /**
     * Mutation domain.
     */
    domain: "agent_context" | "user_visibility";

    /**
     * Mutated state field.
     */
    field: "collapsed" | "visible";

    /**
     * Selector that the tool targeted.
     */
    selector: ViewSelector;

    /**
     * State before the tool ran.
     */
    before: boolean;

    /**
     * State after the tool ran.
     */
    after: boolean;

    /**
     * Whether the tool changed the relevant state.
     */
    changed: boolean;
}

/**
 * Compact action catalog entry sent in the agent context.
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
     * Number of grouping levels in the current hierarchy.
     */
    groupCount: number;

    /**
     * Number of visible samples in the current hierarchy.
     */
    visibleSampleCount: number;
}

/**
 * One level in the current sample grouping hierarchy.
 */
export interface AgentSampleGroupLevel {
    /**
     * Zero-based grouping depth.
     */
    level: number;

    /**
     * Grouping attribute used at this level.
     */
    attribute: AttributeIdentifier;

    /**
     * Human-readable grouping label.
     */
    title: string;
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
     * Effective scale configuration for the channel, if the encoding uses a scale.
     */
    scale?: AgentViewScaleSummary;

    /**
     * Whether this encoding comes from an ancestor view.
     */
    inherited: boolean;
}

/**
 * Effective scale configuration for a view encoding channel.
 */
export interface AgentViewScaleSummary {
    /**
     * Effective scale type.
     */
    type: string;

    /**
     * Effective scale domain.
     */
    domain?: unknown;

    /**
     * Effective scale range.
     */
    range?: unknown;

    /**
     * Effective color scheme.
     */
    scheme?: unknown;

    /**
     * Effective locus assembly.
     */
    assembly?: import("@genome-spy/core/spec/scale.js").Scale["assembly"];

    /**
     * Whether the scale is reversed.
     */
    reverse?: boolean;
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
    visible: boolean;

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
 * Summary of a searchable field configured on a view.
 */
export interface AgentSearchableFieldSummary {
    /**
     * Search field name.
     */
    field: string;

    /**
     * Human-readable field description, if available.
     */
    description?: string;

    /**
     * Cached example strings for the field.
     */
    examples: string[];
}

/**
 * Summary of a searchable view exposed to the agent.
 */
export interface AgentSearchableViewSummary {
    /**
     * Stable selector for the underlying view.
     */
    selector: ViewSelector;

    /**
     * Human-readable title for the searchable view.
     */
    title: string;

    /**
     * Human-readable description of the searchable view, if available.
     */
    description?: string;

    /**
     * Searchable fields configured on the view.
     */
    searchFields: AgentSearchableFieldSummary[];

    /**
     * Datum field names present in the lookup result objects.
     */
    dataFields: string[];
}

/**
 * Result of looking up datum objects in a searchable view.
 */
export interface AgentSearchableViewDatumLookupResult {
    /**
     * Content discriminator.
     */
    kind: "datum_lookup_result";

    /**
     * Structured selector for the searched view.
     */
    selector: ViewSelector;

    /**
     * Lookup query that was executed.
     */
    query: string;

    /**
     * Search mode that was used.
     */
    mode: "exact" | "prefix";

    /**
     * Number of matching datums returned.
     */
    count: number;

    /**
     * Matching datum objects.
     */
    matches: unknown[];
}

/**
 * Bookmarkable provenance action exposed to the agent.
 */
export interface AgentProvenanceAction {
    /**
     * Human-readable summary of the action.
     */
    summary?: string;

    /**
     * Stable provenance id for the current session.
     */
    provenanceId?: string;

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
 * Active interval selection summary used for selection-driven workflows.
 */
export interface AgentSelectionSummary {
    /**
     * Selection kind. Currently only interval selections are surfaced.
     */
    type: "interval";

    /**
     * Human-readable label shown in clarification messages.
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
     * Stable, human-readable identifier for the aggregation candidate.
     */
    candidateId: string;

    /**
     * Addressable view name.
     */
    view: string;

    /**
     * Structured selector for the view.
     */
    viewSelector?: ViewSelector;

    /**
     * Field name.
     */
    field: string;

    /**
     * Field data type.
     */
    dataType: string;

    /**
     * Selection selector for which this field is relevant.
     */
    selectionSelector: ParamSelector;

    /**
     * Supported aggregations for this field.
     */
    supportedAggregations: string[];
}

/**
 * Selection-derived aggregation context exposed to the agent.
 */
export interface AgentSelectionAggregationContext {
    /**
     * Aggregatable fields for the active selections.
     */
    fields: AgentViewFieldSummary[];
}

/**
 * Result of resolving a selection aggregation candidate.
 */
export interface SelectionAggregationResolution {
    /**
     * Content discriminator.
     */
    kind: "selection_aggregation_resolution";

    /**
     * Stable candidate identifier.
     */
    candidateId: string;

    /**
     * Aggregation op that was chosen.
     */
    aggregation: AggregationOp;

    /**
     * Structured selector for the resolved view.
     */
    viewSelector: ViewSelector;

    /**
     * Structured selector for the resolved selection.
     */
    selectionSelector: ParamSelector;

    /**
     * Field name being aggregated.
     */
    field: string;

    /**
     * Canonical attribute identifier.
     */
    attribute: AttributeIdentifier;

    /**
     * Short title for preview or confirmation.
     */
    title: string;

    /**
     * Short description for preview or confirmation.
     */
    description: string;
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
 * Renderable summary line for an agent-authored intent action.
 */
export interface IntentBatchSummaryLine {
    /**
     * Renderable content for chat UIs.
     */
    content: string | import("lit").TemplateResult;

    /**
     * Plain-text fallback for logs and exports.
     */
    text: string;
}

/**
 * Visible sample and grouping counts reported before and after a sample-view
 * mutation.
 */
export interface IntentBatchExecutionSampleViewSummary {
    /**
     * Visible sample count before execution.
     */
    visibleSamplesBefore: number;

    /**
     * Visible sample count after execution.
     */
    visibleSamplesAfter: number;

    /**
     * Number of grouping levels before execution.
     */
    groupLevelsBefore: number;

    /**
     * Number of grouping levels after execution.
     */
    groupLevelsAfter: number;
}

/**
 * Structured content returned when an intent batch executes.
 */
export interface IntentBatchExecutionContent {
    /**
     * Content discriminator.
     */
    kind: "intent_batch_result";

    /**
     * Executed batch.
     */
    batch: IntentBatch;

    /**
     * Visible sample counts for sample-view mutations.
     */
    sampleView?: IntentBatchExecutionSampleViewSummary;

    /**
     * Provenance ids for the actions dispatched by the program.
     */
    provenanceIds?: string[];
}

/**
 * Agent adapter API exposed to the UI and the embed entry point.
 */
export interface AgentAdapter {
    /**
     * Returns the current agent context snapshot.
     */
    getAgentContext(contextOptions?: AgentContextOptions): AgentContext;

    /**
     * Validates an agent-authored intent batch.
     */
    validateIntentBatch(batch: unknown): IntentBatchValidationResult;

    /**
     * Submits a validated intent batch for execution.
     */
    submitIntentActions(
        batch: IntentBatch,
        options?: { submissionKind?: IntentSubmissionKind }
    ): Promise<IntentBatchExecutionResult>;

    /**
     * Resolves a view selector against the current real view hierarchy.
     */
    resolveViewSelector(
        selector: ViewSelector
    ): import("@genome-spy/core/view/view.js").default | undefined;

    /**
     * Changes the configured visibility of a view.
     */
    setViewVisibility(selector: ViewSelector, visibility: boolean): void;

    /**
     * Clears the configured visibility override for a view.
     */
    clearViewVisibility(selector: ViewSelector): void;

    /**
     * Returns the current value source for one metadata attribute.
     */
    getMetadataAttributeSummarySource(
        attribute: AttributeIdentifier
    ): AgentMetadataAttributeSummarySource | undefined;

    /**
     * Returns the current visible grouped value source for one metadata attribute.
     */
    getGroupedMetadataAttributeSummarySource(
        attribute: AttributeIdentifier
    ): AgentGroupedMetadataAttributeSummarySource | undefined;

    /**
     * Activates a provenance state by id.
     */
    jumpToProvenanceState(provenanceId: string): boolean;

    /**
     * Activates the initial provenance state.
     */
    jumpToInitialProvenanceState(): boolean;

    /**
     * Summarizes an execution result for display.
     */
    summarizeExecutionResult(result: IntentBatchExecutionResult): string;

    /**
     * Summarizes provenance actions after a history index.
     */
    summarizeProvenanceActionsSince(
        startIndex: number
    ): IntentBatchSummaryLine[];

    /**
     * Requests an agent turn from the configured agent service.
     */
    requestAgentTurn(
        message: string,
        history?: AgentConversationMessage[],
        streamCallbacks?: AgentStreamCallbacks,
        allowStreaming?: boolean,
        contextOptions?: AgentContextOptions,
        signal?: AbortSignal
    ): Promise<{ response: AgentTurnResponse; trace: Record<string, any> }>;
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
 * Top-level context snapshot sent to the agent.
 */
export interface AgentContext {
    /**
     * Schema version for the agent context.
     */
    schemaVersion: 1;

    /**
     * Agent-facing action catalog.
     */
    actionCatalog: AgentActionCatalogContextEntry[];

    /**
     * Available tools exposed to the agent.
     */
    toolCatalog: AgentToolCatalogEntry[];

    /**
     * Available attributes in the current sample collection.
     */
    attributes: AgentAttributeSummary[];

    /**
     * Searchable views exposed to the agent for datum lookup.
     */
    searchableViews: AgentSearchableViewSummary[];

    /**
     * Selection-derived aggregation candidates exposed to the agent.
     */
    selectionAggregation: AgentSelectionAggregationContext;

    /**
     * Provenance actions for the current analysis history.
     */
    provenance: AgentProvenanceAction[];

    /**
     * Sample-collection summary.
     */
    sampleSummary: AgentSampleSummary;

    /**
     * Current grouping levels in the sample hierarchy.
     */
    sampleGroupLevels: AgentSampleGroupLevel[];

    /**
     * Application lifecycle state.
     */
    lifecycle: {
        appInitialized: boolean;
    };

    /**
     * Root node of the normalized view hierarchy snapshot.
     */
    viewRoot: AgentViewNode;
}

/**
 * Optional context overlay used while building the agent snapshot.
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
 * Request for additional user input when a response cannot be resolved.
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
 * Conversation turn sent to the agent service.
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

export type AgentIntentBatchStep = GeneratedAgentIntentBatchStep;

/**
 * Backward-compatible alias for intent batch steps.
 */
export type IntentBatchStep = AgentIntentBatchStep;

/**
 * Ordered list of actions proposed by the agent.
 */
export interface IntentBatch {
    /**
     * Schema version for the intent batch.
     */
    schemaVersion: 1;

    /**
     * Ordered action steps.
     */
    steps: AgentIntentBatchStep[];

    /**
     * Optional agent rationale.
     */
    rationale?: string;
}

/**
 * Result of validating an agent-authored schema against the generated agent
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
 * Result of validating an intent batch against the current visualization.
 */
export interface IntentBatchValidationResult {
    /**
     * Whether validation succeeded.
     */
    ok: boolean;

    /**
     * Validation errors when `ok` is false.
     */
    errors: string[];

    /**
     * Normalized batch when validation succeeds.
     */
    batch?: IntentBatch;
}

/**
 * Result of executing a validated intent batch.
 */
export interface IntentBatchExecutionResult {
    /**
     * Whether execution succeeded.
     */
    ok: boolean;

    /**
     * Number of executed actions.
     */
    executedActions: number;

    /**
     * Structured execution content.
     */
    content: IntentBatchExecutionContent;

    /**
     * Human-readable summaries of the executed steps.
     */
    summaries: IntentBatchSummaryLine[];

    /**
     * Executed batch.
     */
    batch: IntentBatch;
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
 * Top-level response returned by the agent-turn endpoint.
 */
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
