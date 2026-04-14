import type { AgentIntentProgram } from "./schemaContract.js";
import type { AggregationOp } from "../sampleView/types.d.ts";

/*
 * Source of truth for planner-visible tool input shapes and their field
 * documentation. The generator scripts read this file to produce the runtime
 * catalog and JSON Schema artifacts.
 */

type ViewSelector = {
    scope: string[];
    view: string;
};

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
 * Returns the view to its default visibility.
 *
 * @example
 * {
 *   "selector": {
 *     "scope": [],
 *     "view": "track"
 *   }
 * }
 */
export interface ClearViewVisibilityToolInput {
    /**
     * Stable selector for the view whose override should be cleared.
     */
    selector: ViewSelector;
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
export interface JumpToInitialProvenanceStateToolInput {}

/**
 * Resolve a selection aggregation candidate into an `AttributeIdentifier`
 * that can be used for subsequent intent actions. Before using this tool,
 * you must make an interval selection using a parameter or ensure that
 * one already exists. This tool does not apply any aggregation itself.
 * Use the `submitIntentProgram` tool after using this tool.
 *
 * @example
 * {
 *   "candidateId": "brush@beta-values:beta",
 *   "aggregation": "max"
 * }
 */
export interface ResolveSelectionAggregationCandidateToolInput {
    /**
     * Stable identifier for the selected candidate row. The identifiers are
     * available in `selectionAggregationCandidates` in the view context.
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
 * Execute a provenance-changing intent program with one or more ordered
 * actions. Actions are additive. Before submitting new actions, always
 * consult the current provenance state that defines the state of the
 * analysis. Jump to a prior provenance state if necessary to continue from
 * an earlier point in the analysis.
 *
 * @example
 * {
 *   "program": {
 *     "schemaVersion": 1,
 *     "steps": [
 *       {
 *         "actionType": "sampleView/groupToQuartiles",
 *         "payload": {
 *           "attribute": {
 *             "type": "SAMPLE_ATTRIBUTE",
 *             "specifier": "age"
 *           }
 *         }
 *       }
 *     ]
 *   }
 * }
 */
export interface SubmitIntentProgramToolInput {
    /**
     * Structured intent program to execute.
     */
    program: AgentIntentProgram;
}

/**
 * Tool inputs exposed to the planner.
 */
export interface AgentToolInputs {
    expandViewNode: ExpandViewNodeToolInput;
    collapseViewNode: CollapseViewNodeToolInput;
    setViewVisibility: SetViewVisibilityToolInput;
    clearViewVisibility: ClearViewVisibilityToolInput;
    jumpToProvenanceState: JumpToProvenanceStateToolInput;
    jumpToInitialProvenanceState: JumpToInitialProvenanceStateToolInput;
    resolveSelectionAggregationCandidate: ResolveSelectionAggregationCandidateToolInput;
    submitIntentProgram: SubmitIntentProgramToolInput;
}
