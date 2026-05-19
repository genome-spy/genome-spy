import type { AgentIntentActionRequest } from "./schemaContract.js";
import type { AgentIntentBatchStep } from "./generated/generatedActionTypes.js";
import type { AggregationOp, ViewSelector } from "@genome-spy/app/agentShared";
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
};

export type AgentAttributeCandidate =
    | SampleAttributeIdentifier
    | SelectionAggregationCandidate;

export type PlotAttributeIdentifier = AgentAttributeCandidate;

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
 * Jump to a prior provenance state identified by the given provenance id.
 * Consult provenance history first when a request should continue from an
 * earlier analysis state, even if the user did not explicitly ask to jump
 * back.
 *
 * @example
 * {
 *   "provenanceId": "provenance-12"
 * }
 */
export interface JumpToProvenanceStateToolInput {
    /**
     * Provenance id to jump to.
     */
    provenanceId: string;
}

/**
 * Jump to the initial provenance state before any actions were dispatched.
 */
export type JumpToInitialProvenanceStateToolInput = Record<string, never>;

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
     * Attribute candidate to summarize. Use `SAMPLE_ATTRIBUTE` for sample
     * metadata attributes from context. Use `SELECTION_AGGREGATION` for
     * selection-derived candidates from `selectionAggregation.fields`.
     */
    attribute: AgentAttributeCandidate;

    /**
     * Summary scope. Use `visible_samples` for a pooled summary across the
     * current visible samples. Use `visible_groups` for summaries within each
     * current visible group after grouping has already been applied.
     */
    scope: AttributeSummaryScope;
}

/**
 * Summarize one raw record field inside a selected interval before per-sample
 * aggregation. Use this when choosing a `recordFilter` for a
 * `SELECTION_AGGREGATION` candidate and the compact
 * `selectionAggregation.fields[].filterableFields` metadata is not enough.
 * The field must be copied from that candidate's `filterableFields`.
 *
 * @example
 * {
 *   "candidateId": "brush@mutations:VAF",
 *   "field": "functionalCategory"
 * }
 */
export interface GetSelectionRecordFieldSummaryToolInput {
    /**
     * Exact candidate id copied from `selectionAggregation.fields`.
     */
    candidateId: string;

    /**
     * Raw record field copied from the selected candidate's
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
 * finds nothing.
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
 * Search datum objects in one specific searchable view.
 *
 * @example
 * {
 *   "selector": {
 *     "scope": [],
 *     "view": "gene-track"
 *   },
 *   "query": "TP53",
 *   "field": "",
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
     * Search field name. Use an empty string to search all configured fields.
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
 *
 * @example
 * {
 *   "actionType": "sampleView/groupToQuartiles",
 *   "includeSchema": false
 * }
 */
export interface GetIntentActionDocsToolInput {
    /**
     * Intent action type whose docs should be read.
     */
    actionType: IntentActionType;

    /**
     * Whether to include the raw payload schema. The default response is more
     * compact and usually sufficient.
     */
    includeSchema?: boolean;
}

/**
 * Animate one named zoomable scale to an exact domain. Scale names come from
 * `scaleDomains` in the volatile context and from `domainRef` fields in the
 * view tree. Scales are not addressed with view selectors.
 *
 * @example
 * {
 *   "scaleName": "x",
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
 * In addition, before constructing the action, ensure that every `attribute`
 * (AttributeIdentifier) is presented to you in the context or tool results.
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
    jumpToInitialProvenanceState: JumpToInitialProvenanceStateToolInput;
    getAttributeSummary: GetAttributeSummaryToolInput;
    getSelectionRecordFieldSummary: GetSelectionRecordFieldSummaryToolInput;
    resolveMetadataAttributeValues: ResolveMetadataAttributeValuesToolInput;
    searchViewDatums: SearchViewDatumsToolInput;
    getIntentActionDocs: GetIntentActionDocsToolInput;
    zoomToScale: ZoomToScaleToolInput;
    submitIntentAction: SubmitIntentActionToolInput;
    showCategoryCountsPlot: ShowCategoryCountsPlotToolInput;
    showAttributeDistributionPlot: ShowAttributeDistributionPlotToolInput;
    showAttributeRelationshipPlot: ShowAttributeRelationshipPlotToolInput;
}
