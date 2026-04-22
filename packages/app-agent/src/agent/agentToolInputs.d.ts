import type { AgentIntentActionRequest } from "./schemaContract.js";
import type { AggregationOp, ViewSelector } from "../agentShared/index.d.ts";

/*
 * Source of truth for agent-visible tool input shapes and their field
 * documentation. The generator scripts read this file to produce the runtime
 * catalog and JSON Schema artifacts.
 */

type SampleAttributeIdentifier = {
    type: "SAMPLE_ATTRIBUTE";
    specifier: string;
};

type IntentActionType =
    AgentIntentActionRequest["actions"][number]["actionType"];
type MetadataSummaryScope = "visible_samples" | "visible_groups";

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
 * Build an `AttributeIdentifier` for a selection-derived aggregation so it can
 * be used in a later intent action. Before using this tool, you must make an
 * interval selection using a parameter or ensure that one already exists. This
 * tool does not compute or return an aggregated value. Use the
 * `submitIntentActions` tool after using this tool. If the requested locus or
 * interval is not the current selection, update the selection first.
 *
 * @example
 * {
 *   "candidateId": "brush@foo:bar",
 *   "aggregation": "max"
 * }
 */
export interface BuildSelectionAggregationAttributeToolInput {
    /**
     * Stable identifier for the selected candidate row. The identifiers are
     * available in `selectionAggregation.fields` in the volatile context.
     * They become available after a selection is made with a successful
     * `paramChange` action.
     */
    candidateId: string;

    /**
     * Aggregation op to apply to the candidate field.
     */
    aggregation: AggregationOp;
}

/**
 * Return a compact summary of one metadata attribute across visible samples or
 * within each current visible group.
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
export interface GetMetadataAttributeSummaryToolInput {
    /**
     * Stable attributeIdentifier for the metadata attribute to summarize. In v0,
     * this must be a `SAMPLE_ATTRIBUTE` identifier from the current context.
     */
    attribute: SampleAttributeIdentifier;

    /**
     * Summary scope. Use `visible_samples` for a pooled summary across the
     * current visible samples. Use `visible_groups` for summaries within each
     * current visible group after grouping has already been applied.
     */
    scope: MetadataSummaryScope;
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
 * Return payload fields and examples for one intent action. Use this before
 * constructing an unfamiliar action payload for `submitIntentActions`.
 *
 * @example
 * {
 *   "actionType": "sampleView/groupToQuartiles",
 *   "includeSchema": false
 * }
 */
export interface GetActionDetailsToolInput {
    /**
     * Intent action type to inspect.
     */
    actionType: IntentActionType;

    /**
     * Whether to include the raw payload schema. The default response is more
     * compact and usually sufficient.
     */
    includeSchema?: boolean;
}

/**
 * Execute one or more provenance-changing actions. Actions are additive.
 * Before submitting new actions, always
 * consult the current provenance state that defines the state of the
 * analysis. Jump to a prior provenance state if necessary to continue from
 * an earlier point in the analysis. In addition, before constructing the
 * action list, ensure that every `attribute` (AttributeIdentifier) is
 * presented to you in the context or tool results. If not, submit actions
 * one by one and consult the updated context after each action, instead
 * of submitting them all at once.
 *
 * @example
 * {
 *   "actions": [
 *     {
 *       "actionType": "sampleView/groupToQuartiles",
 *       "payload": {
 *         "attribute": {
 *           "type": "SAMPLE_ATTRIBUTE",
 *           "specifier": "age"
 *         }
 *       }
 *     }
 *   ],
 *   "note": "Group the cohort by quartiles."
 * }
 */
export interface SubmitIntentActionsToolInput {
    /**
     * Ordered actions to execute.
     */
    actions: AgentIntentActionRequest["actions"];

    /**
     * Optional short note about the intended change.
     */
    note?: AgentIntentActionRequest["note"];
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
    buildSelectionAggregationAttribute: BuildSelectionAggregationAttributeToolInput;
    getMetadataAttributeSummary: GetMetadataAttributeSummaryToolInput;
    searchViewDatums: SearchViewDatumsToolInput;
    getActionDetails: GetActionDetailsToolInput;
    submitIntentActions: SubmitIntentActionsToolInput;
}
