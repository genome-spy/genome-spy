import { buildSelectionAggregationAttribute } from "./selectionAggregationTool.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getMetadataAttributeSummaryTool } from "./metadataAttributeSummaryTool.js";
import { searchViewDatumsTool } from "./searchViewDatumsTool.js";
import { getActionCatalogEntry } from "./actionCatalog.js";
import generatedActionSchema from "./generated/generatedActionSchema.json" with { type: "json" };

/*
 * Tool behavior lives here. The input shapes and user-facing descriptions are
 * documented in `agentToolInputs.d.ts` and projected into generated artifacts.
 */

/**
 * @typedef {Omit<import("./types.d.ts").AgentAdapter, "requestAgentTurn"> & {
 *     expandViewNode?(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector): boolean;
 *     collapseViewNode?(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector): boolean;
 * }} AgentToolRuntime
 */

/**
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: import("./types.d.ts").IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Concrete agent tool handlers keyed by agent tool name.
 */
export const agentTools = {
    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").ExpandViewNodeToolInput} input
     */
    expandViewNode(runtime, input) {
        return updateViewNodeExpansion(runtime, input.selector, true);
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").CollapseViewNodeToolInput} input
     */
    collapseViewNode(runtime, input) {
        return updateViewNodeExpansion(runtime, input.selector, false);
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").SetViewVisibilityToolInput} input
     */
    setViewVisibility(runtime, input) {
        const selector = input.selector;

        const view = ensureResolvedView(runtime, selector);
        const before = view.isVisible();
        runtime.setViewVisibility(selector, input.visibility);
        const after = view.isVisible();

        return {
            text:
                after === before
                    ? "The view was already in the requested visibility state."
                    : "Updated the requested view visibility.",
            content: createViewStateChange(
                "user_visibility",
                "visible",
                selector,
                before,
                after
            ),
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").JumpToProvenanceStateToolInput} input
     */
    jumpToProvenanceState(runtime, input) {
        const provenanceAction = findProvenanceAction(
            runtime,
            input.provenanceId
        );
        const changed = runtime.jumpToProvenanceState(input.provenanceId);

        return {
            text:
                changed && provenanceAction
                    ? "Jumped to provenance state: " +
                      (provenanceAction.summary ?? provenanceAction.type) +
                      "."
                    : "The requested provenance state was already active.",
            content: createProvenanceStateActivation(
                input.provenanceId,
                provenanceAction,
                false,
                changed
            ),
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     */
    jumpToInitialProvenanceState(runtime) {
        const changed = runtime.jumpToInitialProvenanceState();

        return {
            text: changed
                ? "Jumped to the initial provenance state."
                : "The initial provenance state was already active.",
            content: createProvenanceStateActivation(
                undefined,
                undefined,
                true,
                changed
            ),
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").BuildSelectionAggregationAttributeToolInput} input
     */
    buildSelectionAggregationAttribute(runtime, input) {
        try {
            const resolution = buildSelectionAggregationAttribute(
                runtime.getAgentVolatileContext(),
                input.candidateId,
                input.aggregation
            );

            return {
                text:
                    `Built an AttributeIdentifier for ${resolution.title} from ` +
                    `${input.candidateId}. No aggregated value was computed. ` +
                    "Use content.attribute as payload.attribute in the next " +
                    "`submitIntentActions` call. If you need a different locus " +
                    "or interval, update the selection first.",
                content: resolution,
            };
        } catch (error) {
            throw new ToolCallRejectionError(
                error instanceof Error ? error.message : String(error)
            );
        }
    },

    getMetadataAttributeSummary: getMetadataAttributeSummaryTool,
    searchViewDatums: searchViewDatumsTool,

    /**
     * @param {AgentToolRuntime} _runtime
     * @param {import("./agentToolInputs.d.ts").GetActionDetailsToolInput} input
     */
    getActionDetails(_runtime, input) {
        const entry = getActionCatalogEntry(input.actionType);
        if (!entry) {
            throw new ToolCallRejectionError(
                "Unsupported intent actionType " + input.actionType + "."
            );
        }

        const content = {
            actionType: entry.actionType,
            description: entry.description,
            ...(entry.usage ? { usage: entry.usage } : {}),
            payloadFields: entry.payloadFields,
            examples: entry.examples,
            ...(input.includeSchema
                ? { schema: getActionPayloadSchema(entry.actionType) }
                : {}),
        };

        return {
            text: "Fetched details for " + input.actionType + ".",
            content,
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").SubmitIntentActionsToolInput} input
     */
    async submitIntentActions(runtime, input) {
        try {
            const result = await runtime.submitIntentActions(
                {
                    schemaVersion: 1,
                    steps: input.actions,
                    rationale: input.note,
                },
                {
                    submissionKind: "agent",
                }
            );
            return {
                text: runtime.summarizeExecutionResult(result),
                content: result.content,
                summaries: result.summaries,
            };
        } catch (error) {
            // Surface intent execution failures back to the model as a rejected tool call.
            if (error instanceof ToolCallRejectionError) {
                throw error;
            }

            throw new ToolCallRejectionError(
                error instanceof Error ? error.message : String(error)
            );
        }
    },
};

/**
 * @param {import("./types.d.ts").AgentActionType} actionType
 * @returns {Record<string, any>}
 */
function getActionPayloadSchema(actionType) {
    const stepSchemas =
        generatedActionSchema.definitions.AgentIntentBatchStep.anyOf;
    const stepSchema = stepSchemas.find(
        (schema) => schema.properties.actionType.const === actionType
    );

    if (!stepSchema) {
        throw new ToolCallRejectionError(
            "Missing generated schema for intent actionType " + actionType + "."
        );
    }

    return stepSchema.properties.payload;
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 */
function ensureResolvedView(runtime, selector) {
    const view = runtime.resolveViewSelector(selector);
    if (!view) {
        throw new ToolCallRejectionError(
            "Selector did not resolve in the current view hierarchy."
        );
    }
    return view;
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 * @param {boolean} expanded
 * @returns {AgentToolExecutionResult}
 */
function updateViewNodeExpansion(runtime, selector, expanded) {
    ensureResolvedView(runtime, selector);
    const changed = expanded
        ? runtime.expandViewNode(selector)
        : runtime.collapseViewNode(selector);
    const before = expanded ? !changed : changed;
    const text = expanded
        ? changed
            ? "Expanded the requested view branch."
            : "The requested view branch was already expanded."
        : changed
          ? "Collapsed the requested view branch."
          : "The requested view branch was already collapsed.";

    return {
        text,
        content: createViewStateChange(
            "agent_context",
            "collapsed",
            selector,
            before,
            expanded
        ),
    };
}

/**
 * @param {import("./types.d.ts").AgentViewStateChange["domain"]} domain
 * @param {import("./types.d.ts").AgentViewStateChange["field"]} field
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 * @param {boolean} before
 * @param {boolean} after
 * @returns {import("./types.d.ts").AgentViewStateChange}
 */
function createViewStateChange(domain, field, selector, before, after) {
    return {
        kind: "view_state_change",
        domain,
        field,
        selector,
        before,
        after,
        changed: before !== after,
    };
}

/**
 * @param {string | undefined} provenanceId
 * @param {import("./types.d.ts").AgentProvenanceAction | undefined} action
 * @param {boolean} initial
 * @param {boolean} changed
 * @returns {{
 *     kind: "provenance_state_activation";
 *     provenanceId?: string;
 *     actionType?: string;
 *     summary?: string;
 *     initial: boolean;
 *     changed: boolean;
 * }}
 */
function createProvenanceStateActivation(
    provenanceId,
    action,
    initial,
    changed
) {
    return {
        kind: "provenance_state_activation",
        ...(provenanceId ? { provenanceId } : {}),
        ...(action
            ? {
                  actionType: action.type,
                  summary: action.summary ?? action.type,
              }
            : {}),
        initial,
        changed,
    };
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {string} provenanceId
 * @returns {import("./types.d.ts").AgentProvenanceAction}
 */
function findProvenanceAction(runtime, provenanceId) {
    const action = runtime
        .getAgentContext()
        .provenance.find((entry) => entry.provenanceId === provenanceId);
    if (!action) {
        throw new ToolCallRejectionError(
            "Unknown provenance id " + provenanceId + "."
        );
    }

    return action;
}
