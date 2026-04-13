import { resolveSelectionAggregationCandidate } from "./selectionAggregationTool.js";

/*
 * Tool behavior lives here. The input shapes and user-facing descriptions are
 * documented in `agentToolInputs.d.ts` and projected into generated artifacts.
 */

/**
 * @typedef {import("./agentToolInputs.d.ts").ExpandViewNodeToolInput} ExpandViewNodeToolInput
 * @typedef {import("./agentToolInputs.d.ts").CollapseViewNodeToolInput} CollapseViewNodeToolInput
 * @typedef {import("./agentToolInputs.d.ts").SetViewVisibilityToolInput} SetViewVisibilityToolInput
 * @typedef {import("./agentToolInputs.d.ts").ClearViewVisibilityToolInput} ClearViewVisibilityToolInput
 * @typedef {import("./agentToolInputs.d.ts").ResolveSelectionAggregationCandidateToolInput} ResolveSelectionAggregationCandidateToolInput
 * @typedef {import("./agentToolInputs.d.ts").SubmitIntentProgramToolInput} SubmitIntentProgramToolInput
 * @typedef {import("./types.d.ts").AgentContext} AgentContext
 * @typedef {import("./types.d.ts").AgentContextOptions} AgentContextOptions
 * @typedef {import("./types.d.ts").IntentProgram} IntentProgram
 * @typedef {import("./types.d.ts").IntentProgramExecutionResult} IntentProgramExecutionResult
 * @typedef {import("./types.d.ts").IntentProgramSummaryLine} IntentProgramSummaryLine
 * @typedef {import("./types.d.ts").AgentViewStateChange} AgentViewStateChange
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {{
 *     getAgentContext(contextOptions?: AgentContextOptions): AgentContext;
 *     resolveViewSelector(selector: ViewSelector): import("@genome-spy/core/view/view.js").default | undefined;
 *     setViewVisibility(selector: ViewSelector, visibility: boolean): void;
 *     clearViewVisibility(selector: ViewSelector): void;
 *     expandViewNode?(selector: ViewSelector): boolean;
 *     collapseViewNode?(selector: ViewSelector): boolean;
 *     submitIntentProgram(program: IntentProgram): Promise<IntentProgramExecutionResult>;
 *     summarizeExecutionResult(result: IntentProgramExecutionResult): string;
 * }} AgentToolRuntime
 */

/**
 * Error thrown for expected planner-facing tool rejections.
 */
export class ToolCallRejectionError extends Error {}

/**
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentProgramSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Concrete agent tool handlers keyed by planner tool name.
 */
export const agentTools = {
    expandViewNode,
    collapseViewNode,
    setViewVisibility,
    clearViewVisibility,
    resolveSelectionAggregationCandidate:
        resolveSelectionAggregationCandidateTool,
    submitIntentProgram: submitIntentProgramTool,
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
 * Resolves a selection aggregation candidate into an attribute identifier.
 *
 * @param {AgentToolRuntime} runtime
 * @param {ResolveSelectionAggregationCandidateToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function resolveSelectionAggregationCandidateTool(runtime, input) {
    try {
        const resolution = resolveSelectionAggregationCandidate(
            runtime.getAgentContext(),
            input.candidateId,
            input.aggregation
        );

        return {
            text:
                "Resolved " +
                resolution.title +
                " for " +
                input.candidateId +
                ".",
            content: resolution,
        };
    } catch (error) {
        throw new ToolCallRejectionError(
            error instanceof Error ? error.message : String(error)
        );
    }
}

/**
 * Executes a provenance-changing intent program.
 *
 * @param {AgentToolRuntime} runtime
 * @param {SubmitIntentProgramToolInput} input
 * @returns {Promise<AgentToolExecutionResult>}
 */
export async function submitIntentProgramTool(runtime, input) {
    const result = await runtime.submitIntentProgram(input.program);
    return {
        text: runtime.summarizeExecutionResult(result),
        content: result.content,
        summaries: result.summaries,
    };
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
