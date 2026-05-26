import type { AgentIntentActionRequest } from "./schemaContract.js";
import type { AgentIntentBatchStep } from "./generated/generatedActionTypes.js";
import type {
    AggregationOp,
    FeatureFilter,
    ViewSelector,
} from "@genome-spy/app/agentShared";
import type { ChromosomalLocus } from "@genome-spy/core/spec/genome.js";
import type { NumericDomain } from "@genome-spy/core/spec/scale.js";

/*
 * Source of truth for agent-visible tool input shapes and their field
 * documentation. The generator scripts read this file to produce the runtime
 * catalog and JSON Schema artifacts.
 */

type SampleAttributeIdentifier = {
    type: "SAMPLE_ATTRIBUTE";
    specifier: string;
};

type SelectionAggregationCandidate = {
    type: "SELECTION_AGGREGATION";

    /**
     * Exact candidate id copied from `selectionAggregation.fields`. Do not
     * construct this from parameter, view, or field names.
     */
    candidateId: string;

    /**
     * Aggregation applied within the selected interval separately for each
     * sample. This cannot be used to aggregate across samples or groups.
     */
    aggregation: AggregationOp;

    /**
     * Optional raw-feature predicate applied inside the selected interval
     * before per-sample aggregation. Use one field copied from the candidate's
     * `filterableFields`; call `getSelectionFeatureFieldSummary` first if
     * exact categorical values or numeric bounds are needed.
     */
    featureFilter?: FeatureFilter;
};

type UnfilteredSelectionAggregationCandidate = Omit<
    SelectionAggregationCandidate,
    "featureFilter"
>;

export type AgentAttributeCandidate =
    | SampleAttributeIdentifier
    | SelectionAggregationCandidate;

type UnfilteredAgentAttributeCandidate =
    | SampleAttributeIdentifier
    | UnfilteredSelectionAggregationCandidate;

export type PlotAttributeIdentifier = UnfilteredAgentAttributeCandidate;

type AttributeSummaryCandidate = UnfilteredAgentAttributeCandidate;

type IntentActionType = AgentIntentBatchStep["actionType"];
type AttributeSummaryScope = "visible_samples" | "visible_groups";

interface AgentChromosomalLocus extends ChromosomalLocus {
    /**
     * Zero-based position inside the chromosome or contig.
     */
    pos: number;
}

type ZoomToScaleDomain = NumericDomain | AgentChromosomalLocus[];

/**
 * Expand a collapsed view branch in the agent context. The result is only
 * visible in the context and not observable by the user.
 * @toolKind do
 * @toolSubkind context
 *
 * @example
 * {
 *   "selector": {
 *     "scope": [],
 *     "view": "track"
 *   }
 * }
 */
export interface ExpandViewNodeToolInput {
    /**
     * Stable selector for the collapsed view node to expand.
     */
    selector: ViewSelector;
}

/**
 * Collapse a previously expanded view branch in the agent context.
 * @toolKind do
 * @toolSubkind context
 *
 * @example
 * {
 *   "selector": {
 *     "scope": [],
 *     "view": "track"
 *   }
 * }
 */
export interface CollapseViewNodeToolInput {
    /**
     * Stable selector for the view node to collapse.
     */
    selector: ViewSelector;
}

/**
 * Set the visibility of a view. This is a user-facing change that will be reflected in the UI.
 * @toolKind do
 * @toolSubkind state_change
 *
 * @example
 * {
 *   "selector": {
 *     "scope": [],
 *     "view": "reference-sequence"
 *   },
 *   "visibility": false
 * }
 */
export interface SetViewVisibilityToolInput {
    /**
     * Stable selector for the view whose visibility should change.
     */
    selector: ViewSelector;

    /**
     * Whether the view should be visible.
     */
    visibility: boolean;
}

/**
 * Jump to a prior provenance state identified by the given provenance id, or
 * to the initial state before any actions when the provenance id is null.
 * Consult provenance history first when a request should continue from an
 * earlier analysis state, even if the user did not explicitly ask to jump
 * back.
 * @toolKind do
 * @toolSubkind state_change
 *
 * @example
 * {
 *   "provenanceId": "provenance-12"
 * }
 *
 * @example
 * {
 *   "provenanceId": null
 * }
 */
export interface JumpToProvenanceStateToolInput {
    /**
     * Provenance id to jump to, or null to jump to the initial state.
     * The visualization state is defined by the action identified by the
     * provenance id and all preceding actions in provenance.
     */
    provenanceId: string | null;
}

/**
 * Return a compact summary of one attribute (metadata or selection-derived)
 * across visible samples or within each current visible group.
 * When summarizing a `SELECTION_AGGREGATION`, the candidate aggregation is
 * resolved first per sample, and this tool summarizes those per-sample values
 * across visible samples or groups.
 * For quantitative summaries, use `nonZeroCount`/`positiveCount` for selected
 * item presence when the selection aggregation is `count`. Use
 * `valueDistribution` for exact value frequencies or bounded histogram bins.
 * Use `visible_samples` for pooled metadata facts such as available category
 * values or numeric ranges. Use `visible_groups` only after the sample view is
 * already grouped and the user needs per-group facts. If the user asks to group
 * by one attribute and then compare or report another attribute by group, first
 * submit the grouping action, wait for the refreshed context, and then call
 * this tool with `scope: "visible_groups"` for the attribute to report.
 * In the response, `categories` are always sorted by size and do not reflect
 * metadata order.
 * @toolKind know
 * @toolSubkind study
 *
 * @example
 * {
 *   "attribute": {
 *     "type": "SAMPLE_ATTRIBUTE",
 *     "specifier": "tissue"
 *   },
 *   "scope": "visible_groups"
 * }
 */
export interface GetAttributeSummaryToolInput {
    /**
     * Attribute candidate to summarize. Use `SAMPLE_ATTRIBUTE` for entries
     * from `sampleAttributes`. Use `SELECTION_AGGREGATION` for
     * selection-derived candidates from `selectionAggregation.fields`.
     */
    attribute: AttributeSummaryCandidate;

    /**
     * Summary scope. Use `visible_samples` for a pooled summary across the
     * current visible samples. Use `visible_groups` for summaries within each
     * current visible group after grouping has already been applied.
     */
    scope: AttributeSummaryScope;
}

/**
 * List compact current sample groups by level or parent path. Use before
 * group-specific actions such as `removeGroup`. The response includes an
 * interpretation guide.
 * @toolKind know
 * @toolSubkind study
 *
 * @example
 * {
 *   "parentPath": ["PDS"]
 * }
 *
 * @example
 * {
 *   "level": 2
 * }
 */
export interface GetSampleGroupsToolInput {
    /**
     * One-based grouping level to list. `1` lists top-level groups under ROOT.
     * When `parentPath` is supplied, `level` must identify the direct children
     * of that parent.
     *
     * @minimum 1
     */
    level?: number;

    /**
     * Parent group path. When supplied without `level`, the tool lists that
     * parent group's direct child groups.
     */
    parentPath?: string[];

    /**
     * Maximum number of groups to return. Defaults to 20.
     *
     * @minimum 1
     */
    limit?: number;
}

/**
 * Summarize one raw feature field inside a selected interval before
 * per-sample aggregation. Values are pooled across samples, and counts are
 * raw feature counts rather than sample counts. Use this when choosing a
 * `featureFilter` for a `SELECTION_AGGREGATION` candidate and the compact
 * `selectionAggregation.fields[].filterableFields` metadata is not enough.
 * The field must be copied from that candidate's `filterableFields`.
 * @toolKind know
 * @toolSubkind study
 *
 * @example
 * {
 *   "candidateId": "brush@mutations:VAF",
 *   "field": "functionalCategory"
 * }
 */
export interface GetSelectionFeatureFieldSummaryToolInput {
    /**
     * Exact candidate id copied from `selectionAggregation.fields`.
     */
    candidateId: string;

    /**
     * Raw feature field copied from the selected candidate's
     * `filterableFields`.
     */
    field: string;
}

/**
 * Resolve a free-text metadata value against current visible categorical sample
 * metadata values. Use this when the user names a category value such as
 * `relapse`, `AML`, or `female` but does not name the metadata attribute that
 * contains it. Prefer this tool over guessing the attribute from title
 * similarity alone. Exact case-insensitive matches are preferred. A bounded
 * Levenshtein fallback may return typo-tolerant matches when exact matching
 * finds nothing. This does not query metadata sources.
 * @toolKind know
 * @toolSubkind find
 *
 * @example
 * {
 *   "query": "relapse"
 * }
 */
export interface ResolveMetadataAttributeValuesToolInput {
    /**
     * Free-text metadata value to resolve against current visible categorical
     * metadata values.
     */
    query: string;
}

/**
 * Search datum objects in the view identified by the selector. Carefully choose
 * the most relevant view from `searchableViews` or if unsure, query them all.
 * @toolKind know
 * @toolSubkind find
 *
 * @example
 * {
 *   "selector": {
 *     "scope": [],
 *     "view": "gene-track"
 *   },
 *   "query": "TP53",
 *   "field": "*",
 *   "mode": "exact"
 * }
 */
export interface SearchViewDatumsToolInput {
    /**
     * Stable selector for the searchable view to inspect.
     */
    selector: ViewSelector;

    /**
     * Search term to match against the view's configured search fields.
     */
    query: string;

    /**
     * Search field name. Use `*` to search all configured fields.
     */
    field: string;

    /**
     * Search mode. `exact` matches the whole field value. `prefix` matches the
     * beginning of the field value.
     */
    mode: "exact" | "prefix";
}

/**
 * Read documentation, fields, and examples for one intent action. Use this
 * before constructing an unfamiliar action payload for `submitIntentAction`.
 * This tool doesn't execute the action or mutate any state. Do not repeat
 * the call if documentation is already available in the conversation history.
 * @toolKind know
 * @toolSubkind learn
 *
 * @example
 * {
 *   "actionType": "sampleView/groupToQuartiles"
 * }
 */
export interface GetIntentActionDocsToolInput {
    /**
     * Intent action type whose docs should be read.
     */
    actionType: IntentActionType;
}

/**
 * Read schema and usage details for one intent action payload field type. Use
 * this when `getIntentActionDocs` shows a complex `payloadFields[].type` that
 * is not clear from examples alone. This tool does not execute actions or
 * mutate state.
 * @toolKind know
 * @toolSubkind learn
 *
 * @example
 * {
 *   "typeName": "AttributeIdentifier",
 *   "referenceDepth": 1
 * }
 */
export interface GetIntentActionTypeDocsToolInput {
    /**
     * Type copied from an action `payloadFields[].type` value or from a
     * previous action type docs response's `referencedTypes`.
     */
    typeName: string;

    /**
     * How far to include referenced definitions. Use `0` for only the
     * requested type and `1` for immediate referenced types.
     */
    referenceDepth?: 0 | 1;
}

/**
 * Animate one named zoomable scale to an exact domain. Scale names come from
 * `scaleDomains` in the volatile context and from `domainRef` fields in the
 * view tree. Scales are not addressed with view selectors.
 * Zooming only changes the user-visible viewport. You cannot use it for
 * analysis purposes.
 * @toolKind do
 * @toolSubkind state_change
 *
 * @example
 * {
 *   "scaleName": "x-scale",
 *   "domain": [
 *     { "chrom": "chr1", "pos": 1000 },
 *     { "chrom": "chr1", "pos": 3000 }
 *   ]
 * }
 */
export interface ZoomToScaleToolInput {
    /**
     * Name of a zoomable scale from the current volatile context.
     */
    scaleName: string;

    /**
     * Target domain for the scale. Use the same domain value shape that appears
     * for this scale in `scaleDomains`.
     */
    domain: ZoomToScaleDomain;
}

/**
 * Execute one provenance-changing action. Actions are additive. Before
 * submitting a new action, always consult the current provenance state that
 * defines the state of the analysis. Does it make sense to add this action
 * on top of the actions already in provenance? Jump to a prior provenance
 * state if necessary to continue from an earlier point in the analysis.
 * Also, if the user requests an alternative analysis or doing something "again"
 * but differently, think if an earlier state should be restored first.
 * In addition, before constructing the action, ensure that every `attribute`
 * (AttributeIdentifier) is presented to you in the context or tool results.
 * The tool response may include `agentNotes` that guide you in the workflow.
 * @toolKind do
 * @toolSubkind state_change
 *
 * @example
 * {
 *   "action": {
 *     "actionType": "sampleView/groupToQuartiles",
 *     "payload": {
 *       "attribute": {
 *         "type": "SAMPLE_ATTRIBUTE",
 *         "specifier": "age"
 *       }
 *     }
 *   },
 *   "note": "Group the cohort by quartiles."
 * }
 */
export interface SubmitIntentActionToolInput {
    /**
     * Action to execute.
     */
    action: AgentIntentBatchStep;

    /**
     * Optional short note about the intended change.
     */
    note?: AgentIntentActionRequest["note"];
}

/**
 * Show a bar plot of counts for one categorical sample attribute.
 * Use this tool when the user asks for a bar plot, counts, or category
 * distribution. When current sample groups are present, the x-axis shows
 * those groups and colors show the counted attribute categories.
 * @toolKind do
 * @toolSubkind plot
 *
 * @example
 * {
 *   "attribute": {
 *     "type": "SAMPLE_ATTRIBUTE",
 *     "specifier": "diagnosis"
 *   }
 * }
 */
export interface ShowCategoryCountsPlotToolInput {
    /**
     * Categorical attribute to count.
     */
    attribute: PlotAttributeIdentifier;
}

/**
 * Show a quantitative distribution plot in the chat transcript.
 * Current sample groups are shown on the x-axis and the quantitative
 * attribute is shown on the y-axis.
 * @toolKind do
 * @toolSubkind plot
 *
 * @example
 * {
 *   "kind": "boxplot",
 *   "attribute": {
 *     "type": "SAMPLE_ATTRIBUTE",
 *     "specifier": "age"
 *   }
 * }
 */
export interface ShowAttributeDistributionPlotToolInput {
    /**
     * Distribution plot kind.
     */
    kind: "boxplot";

    /**
     * Quantitative value attribute to summarize.
     */
    attribute: PlotAttributeIdentifier;
}

/**
 * Show a scatterplot comparing two quantitative sample attributes. When
 * sample groups are present, point colors show those groups.
 * @toolKind do
 * @toolSubkind plot
 *
 * @example
 * {
 *   "kind": "scatterplot",
 *   "attributes": [
 *     {
 *       "type": "SAMPLE_ATTRIBUTE",
 *       "specifier": "age"
 *     },
 *     {
 *       "type": "SAMPLE_ATTRIBUTE",
 *       "specifier": "purity"
 *     }
 *   ]
 * }
 */
export interface ShowAttributeRelationshipPlotToolInput {
    /**
     * Relationship plot kind.
     */
    kind: "scatterplot";

    /**
     * Two different quantitative attributes to compare. Keep both attributes in
     * one ordered array: the first is rendered on x and the second on y. Do not
     * treat either attribute as a grouping variable.
     */
    attributes: [PlotAttributeIdentifier, PlotAttributeIdentifier];
}

/**
 * Tool inputs exposed to the agent.
 */
export interface AgentToolInputs {
    expandViewNode: ExpandViewNodeToolInput;
    collapseViewNode: CollapseViewNodeToolInput;
    setViewVisibility: SetViewVisibilityToolInput;
    jumpToProvenanceState: JumpToProvenanceStateToolInput;
    getAttributeSummary: GetAttributeSummaryToolInput;
    getSampleGroups: GetSampleGroupsToolInput;
    getSelectionFeatureFieldSummary: GetSelectionFeatureFieldSummaryToolInput;
    resolveMetadataAttributeValues: ResolveMetadataAttributeValuesToolInput;
    searchViewDatums: SearchViewDatumsToolInput;
    getIntentActionDocs: GetIntentActionDocsToolInput;
    getIntentActionTypeDocs: GetIntentActionTypeDocsToolInput;
    zoomToScale: ZoomToScaleToolInput;
    submitIntentAction: SubmitIntentActionToolInput;
    showCategoryCountsPlot: ShowCategoryCountsPlotToolInput;
    showAttributeDistributionPlot: ShowAttributeDistributionPlotToolInput;
    showAttributeRelationshipPlot: ShowAttributeRelationshipPlotToolInput;
}
