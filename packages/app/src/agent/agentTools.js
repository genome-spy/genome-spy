import { buildSelectionAggregationAttribute } from "./selectionAggregationTool.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getMetadataAttributeSummaryTool } from "./metadataAttributeSummaryTool.js";
import { searchViewDatumsTool } from "./searchViewDatumsTool.js";

/*
 * Tool behavior lives here. The input shapes and user-facing descriptions are
 * documented in `agentToolInputs.d.ts` and projected into generated artifacts.
 */

/**
 * @typedef {import("./agentToolInputs.d.ts").ExpandViewNodeToolInput} ExpandViewNodeToolInput
 * @typedef {import("./agentToolInputs.d.ts").CollapseViewNodeToolInput} CollapseViewNodeToolInput
 * @typedef {import("./agentToolInputs.d.ts").SetViewVisibilityToolInput} SetViewVisibilityToolInput
 * @typedef {import("./agentToolInputs.d.ts").ClearViewVisibilityToolInput} ClearViewVisibilityToolInput
 * @typedef {import("./agentToolInputs.d.ts").JumpToProvenanceStateToolInput} JumpToProvenanceStateToolInput
 * @typedef {import("./agentToolInputs.d.ts").JumpToInitialProvenanceStateToolInput} JumpToInitialProvenanceStateToolInput
 * @typedef {import("./agentToolInputs.d.ts").BuildSelectionAggregationAttributeToolInput} BuildSelectionAggregationAttributeToolInput
 * @typedef {import("./agentToolInputs.d.ts").GetMetadataAttributeSummaryToolInput} GetMetadataAttributeSummaryToolInput
 * @typedef {import("./agentToolInputs.d.ts").SubmitIntentActionsToolInput} SubmitIntentActionsToolInput
 * @typedef {import("./types.d.ts").AgentContext} AgentContext
 * @typedef {import("./types.d.ts").AgentContextOptions} AgentContextOptions
 * @typedef {import("./types.d.ts").AgentMetadataAttributeSummarySource} AgentMetadataAttributeSummarySource
 * @typedef {import("./types.d.ts").AgentProvenanceAction} AgentProvenanceAction
 * @typedef {import("./types.d.ts").IntentBatch} IntentBatch
 * @typedef {import("./types.d.ts").IntentBatchExecutionResult} IntentBatchExecutionResult
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {import("./types.d.ts").AgentViewStateChange} AgentViewStateChange
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {{
 *     getAgentContext(contextOptions?: AgentContextOptions): AgentContext;
 *     jumpToProvenanceState(provenanceId: string): boolean;
 *     jumpToInitialProvenanceState(): boolean;
 *     resolveViewSelector(selector: ViewSelector): import("@genome-spy/core/view/view.js").default | undefined;
 *     setViewVisibility(selector: ViewSelector, visibility: boolean): void;
 *     clearViewVisibility(selector: ViewSelector): void;
 *     getMetadataAttributeSummarySource(
 *         attribute: import("../sampleView/types.d.ts").AttributeIdentifier
 *     ): AgentMetadataAttributeSummarySource | undefined;
 *     expandViewNode?(selector: ViewSelector): boolean;
 *     collapseViewNode?(selector: ViewSelector): boolean;
 *     submitIntentActions(
 *         batch: IntentBatch,
 *         options?: { submissionKind?: "agent" | "bookmark" | "user" }
 *     ): Promise<IntentBatchExecutionResult>;
 *     summarizeExecutionResult(result: IntentBatchExecutionResult): string;
 * }} AgentToolRuntime
 */

/**
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Concrete agent tool handlers keyed by agent tool name.
 */
export const agentTools = {
    expandViewNode,
    collapseViewNode,
    setViewVisibility,
    clearViewVisibility,
    jumpToProvenanceState,
    jumpToInitialProvenanceState,
    buildSelectionAggregationAttribute: buildSelectionAggregationAttributeTool,
    getMetadataAttributeSummary: getMetadataAttributeSummaryTool,
    searchViewDatums: searchViewDatumsTool,
    submitIntentActions: submitIntentActionsTool,
};

/**
 * Expands a collapsed view branch in the current session context.
 *
 * @param {AgentToolRuntime} runtime
 * @param {ExpandViewNodeToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function expandViewNode(runtime, input) {
    return updateViewNodeExpansion(runtime, input.selector, true);
}

/**
 * Collapses a previously expanded view branch in the current session context.
 *
 * @param {AgentToolRuntime} runtime
 * @param {CollapseViewNodeToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function collapseViewNode(runtime, input) {
    return updateViewNodeExpansion(runtime, input.selector, false);
}

/**
 * Sets the configured visibility of a view.
 *
 * @param {AgentToolRuntime} runtime
 * @param {SetViewVisibilityToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function setViewVisibility(runtime, input) {
    return updateViewVisibility(runtime, input.selector, false, () =>
        runtime.setViewVisibility(input.selector, input.visibility)
    );
}

/**
 * Clears the visibility override for a view.
 *
 * @param {AgentToolRuntime} runtime
 * @param {ClearViewVisibilityToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function clearViewVisibility(runtime, input) {
    return updateViewVisibility(runtime, input.selector, true, () =>
        runtime.clearViewVisibility(input.selector)
    );
}

/**
 * Jumps to a provenance state by id.
 *
 * @param {AgentToolRuntime} runtime
 * @param {JumpToProvenanceStateToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function jumpToProvenanceState(runtime, input) {
    const provenanceAction = findProvenanceAction(runtime, input.provenanceId);
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
}

/**
 * Jumps to the initial provenance state.
 *
 * @param {AgentToolRuntime} runtime
 * @param {JumpToInitialProvenanceStateToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function jumpToInitialProvenanceState(runtime, input) {
    void input;

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
}

/**
 * Resolves a selection aggregation candidate into an attribute identifier.
 *
 * @param {AgentToolRuntime} runtime
 * @param {BuildSelectionAggregationAttributeToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function buildSelectionAggregationAttributeTool(runtime, input) {
    try {
        const resolution = buildSelectionAggregationAttribute(
            runtime.getAgentContext(),
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
}

/**
 * Executes provenance-changing actions.
 *
 * @param {AgentToolRuntime} runtime
 * @param {SubmitIntentActionsToolInput} input
 * @returns {Promise<AgentToolExecutionResult>}
 */
export async function submitIntentActionsTool(runtime, input) {
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
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {ViewSelector} selector
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
 * @param {ViewSelector} selector
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
 * @param {AgentToolRuntime} runtime
 * @param {ViewSelector} selector
 * @param {boolean} clearing
 * @param {() => void} applyChange
 * @returns {AgentToolExecutionResult}
 */
function updateViewVisibility(runtime, selector, clearing, applyChange) {
    const view = ensureResolvedView(runtime, selector);
    const before = view.isVisible();
    applyChange();
    const after = view.isVisible();

    return {
        text:
            after === before
                ? clearing
                    ? "The visibility override was already clear."
                    : "The view was already in the requested visibility state."
                : clearing
                  ? "Cleared the requested view visibility override."
                  : "Updated the requested view visibility.",
        content: createViewStateChange(
            "user_visibility",
            "visible",
            selector,
            before,
            after
        ),
    };
}

/**
 * @param {AgentViewStateChange["domain"]} domain
 * @param {AgentViewStateChange["field"]} field
 * @param {ViewSelector} selector
 * @param {boolean} before
 * @param {boolean} after
 * @returns {AgentViewStateChange}
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
 * @param {AgentProvenanceAction | undefined} action
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
 * @returns {AgentProvenanceAction}
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
