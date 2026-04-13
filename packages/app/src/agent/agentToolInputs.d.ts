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
 * Resolve a selection aggregation candidate into an `AttributeIdentifier`
 * for intent actions. Before using this tool, you must make an interval
 * selection or ensure that one already exists.
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
 * Execute a provenance-changing intent program with one or more ordered actions.
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
    resolveSelectionAggregationCandidate: ResolveSelectionAggregationCandidateToolInput;
    submitIntentProgram: SubmitIntentProgramToolInput;
}
