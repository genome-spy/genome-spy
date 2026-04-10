import type { AgentIntentProgram } from "./schemaContract.js";
import type { AggregationOp } from "../sampleView/types.d.ts";

type ViewSelector = {
    scope: string[];
    view: string;
};

/**
 * Expand a collapsed view branch in the agent context.
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
 * Set the configured visibility of a view.
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
 * Clear the visibility override for a view.
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
 * for intent actions, plus a short preview.
 *
 * @example
 * {
 *   "candidateId": "brush@beta-values:beta",
 *   "aggregation": "max"
 * }
 */
export interface ResolveSelectionAggregationCandidateToolInput {
    /**
     * Stable identifier for the selected candidate row.
     */
    candidateId: string;

    /**
     * Aggregation op to apply to the candidate field.
     */
    aggregation: AggregationOp;
}

/**
 * Execute a provenance-changing intent program with one or more ordered steps.
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
