import type {
    AttributeIdentifier,
    AggregationOp,
    ParamSelector,
    ParamValue,
    ViewSelector,
} from "../agentShared/index.d.ts";
import type { Scale } from "@genome-spy/core/spec/scale.js";

/**
 * Runtime source used by the metadata summary tool.
 */
export interface AgentMetadataAttributeSummarySource {
    attribute: AttributeIdentifier;
    title: string;
    description?: string;
    dataType: string;
    scope: "visible_samples";
    sampleIds: string[];
    values: unknown[];
}

/**
 * One visible leaf group used by the grouped metadata summary tool.
 */
export interface AgentVisibleSampleGroupSource {
    path: string[];
    titles: string[];
    title: string;
    sampleIds: string[];
}

/**
 * Runtime source used by the grouped metadata summary tool.
 */
export interface AgentGroupedMetadataAttributeSummarySource {
    attribute: AttributeIdentifier;
    title: string;
    description?: string;
    dataType: string;
    scope: "visible_groups";
    groupLevels: AgentSampleGroupLevel[];
    groups: AgentVisibleSampleGroupSource[];
    valuesBySampleId: Record<string, unknown>;
}

/**
 * Summary of an attribute in the agent context.
 */
export interface AgentAttributeSummary {
    id: AttributeIdentifier;
    title: string;
    description?: string;
    dataType: string;
    visible?: boolean;
}

/**
 * Compact summary of the loaded sample collection.
 */
export interface AgentSampleSummary {
    sampleCount: number;
    groupCount: number;
    visibleSampleCount: number;
}

/**
 * One level in the current sample grouping hierarchy.
 */
export interface AgentSampleGroupLevel {
    level: number;
    attribute: AttributeIdentifier;
    title: string;
}

/**
 * Summary of the visualization's root config.
 */
export interface AgentRootConfigSummary {
    assembly?: string;
    baseUrl?: string;
    genomes?: string[];
    datasets?: string[];
}

/**
 * Summary of a data source used by a view node.
 */
export interface AgentViewDataSummary {
    kind:
        | "url"
        | "inline"
        | "named"
        | "generator"
        | "lazy"
        | "callback"
        | "other";
    source: string;
    format?: string;
    description?: string;
}

/**
 * Summary of an effective encoding channel in the view hierarchy.
 */
export interface AgentViewEncodingSummary {
    sourceKind?: "field" | "expr" | "datum";
    field?: string;
    expr?: string;
    datum?: unknown;
    type?: string;
    title?: string;
    description?: string;
    scale?: AgentViewScaleSummary;
    inherited: boolean;
}

/**
 * Effective scale configuration for a view encoding channel.
 */
export interface AgentViewScaleSummary {
    type: string;
    domain?: unknown;
    range?: unknown;
    scheme?: unknown;
    assembly?: Scale["assembly"];
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
    type: string;
    name?: string;
    title: string;
    description: string;
    selector?: ViewSelector;
    markType?: string;
    visible: boolean;
    collapsed?: boolean;
    childCount?: number;
    data?: AgentViewDataSummary;
    encodings?: AgentViewEncodings;
    parameterDeclarations?: AgentParameterDeclaration[];
    children?: AgentViewNode[];
}

/**
 * Summary of the visualization's root config and top-level node.
 */
export interface AgentViewTreeRoot {
    rootConfig?: AgentRootConfigSummary;
    root: AgentViewNode;
}

/**
 * Summary of a searchable field configured on a view.
 */
export interface AgentSearchableFieldSummary {
    field: string;
    description?: string;
    examples: string[];
}

/**
 * Summary of a searchable view exposed to the agent.
 */
export interface AgentSearchableViewSummary {
    selector: ViewSelector;
    title: string;
    description?: string;
    searchFields: AgentSearchableFieldSummary[];
    dataFields: string[];
}

/**
 * Result of looking up datum objects in a searchable view.
 */
export interface AgentSearchableViewDatumLookupResult {
    kind: "datum_lookup_result";
    selector: ViewSelector;
    query: string;
    mode: "exact" | "prefix";
    count: number;
    matches: unknown[];
}

/**
 * Bookmarkable provenance action exposed to the agent.
 */
export interface AgentProvenanceAction {
    summary?: string;
    provenanceId?: string;
    type: string;
    payload?: unknown;
    meta?: unknown;
    error?: boolean;
}

/**
 * Active interval selection summary used for selection-driven workflows.
 */
export interface AgentSelectionSummary {
    type: "interval";
    label: string;
    description?: string;
    selector: ParamSelector;
    active: boolean;
    nameSuffix: string;
}

/**
 * Summary of a bind used by an adjustable variable parameter.
 */
export interface AgentParameterBindSummary {
    input:
        | "checkbox"
        | "radio"
        | "range"
        | "select"
        | "text"
        | "number"
        | "color";
    label: string;
    description?: string;
    debounce?: number;
    min?: number;
    max?: number;
    step?: number;
    options?: unknown[];
    labels?: string[];
    placeholder?: string;
    autocomplete?: string;
}

/**
 * Shared metadata for an adjustable parameter.
 */
export interface AgentParameterDeclarationBase {
    label: string;
    description?: string;
    value?: ParamValue;
    selector: ParamSelector;
    persist: boolean;
}

/**
 * Static selection capability declared by the visualization spec.
 */
export interface AgentSelectionParameterDeclaration extends AgentParameterDeclarationBase {
    parameterType: "selection";
    selectionType: "point" | "interval";
    encodings?: string[];
    clearable: boolean;
}

/**
 * Adjustable variable parameter bound to an input control.
 */
export interface AgentVariableParameterDeclaration extends AgentParameterDeclarationBase {
    parameterType: "variable";
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
    candidateId: string;
    view: string;
    viewSelector?: ViewSelector;
    field: string;
    dataType: string;
    selectionSelector: ParamSelector;
    supportedAggregations: string[];
}

/**
 * Selection-derived aggregation context exposed to the agent.
 */
export interface AgentSelectionAggregationContext {
    fields: AgentViewFieldSummary[];
}

/**
 * Result of resolving a selection aggregation candidate.
 */
export interface SelectionAggregationResolution {
    kind: "selection_aggregation_resolution";
    candidateId: string;
    aggregation: AggregationOp;
    viewSelector: ViewSelector;
    selectionSelector: ParamSelector;
    field: string;
    attribute: AttributeIdentifier;
    title: string;
    description: string;
}

/**
 * Renderable summary line for an agent-authored intent action.
 */
export interface IntentBatchSummaryLine {
    content: string | import("lit").TemplateResult;
    text: string;
}

/**
 * Visible sample and grouping counts reported before and after a sample-view
 * mutation.
 */
export interface IntentBatchExecutionSampleViewSummary {
    visibleSamplesBefore: number;
    visibleSamplesAfter: number;
    groupLevelsBefore: number;
    groupLevelsAfter: number;
}

/**
 * Structured content returned when an intent batch executes.
 */
export interface IntentBatchExecutionContent {
    kind: "intent_batch_result";
    batch: import("./types.d.ts").IntentBatch;
    sampleView?: IntentBatchExecutionSampleViewSummary;
    provenanceIds?: string[];
}
