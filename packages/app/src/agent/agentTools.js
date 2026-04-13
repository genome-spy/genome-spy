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
 */

/**
 * Error thrown for expected planner-facing tool rejections.
 */
export class ToolCallRejectionError extends Error {}

/**
 * @typedef {{
 *     expandViewNode: (selector: ViewSelector) => void;
 *     collapseViewNode: (selector: ViewSelector) => void;
 *     resolveViewSelector: (selector: ViewSelector) => import("@genome-spy/core/view/view.js").default | undefined;
 *     isViewNodeExpanded: (selector: ViewSelector) => boolean;
 *     isViewVisible: (selector: ViewSelector) => boolean;
 *     setViewVisibility: (selector: ViewSelector, visibility: boolean) => void;
 *     clearViewVisibility: (selector: ViewSelector) => void;
 *     getAgentContext: (contextOptions?: AgentContextOptions) => AgentContext;
 *     submitIntentProgram: (program: IntentProgram) => Promise<IntentProgramExecutionResult>;
 *     summarizeExecutionResult: (result: IntentProgramExecutionResult) => string;
 * }} AgentToolRuntime
 */

/**
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentProgramSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Creates the concrete agent tool handlers.
 *
 * @param {AgentToolRuntime} runtime
 */
export function createAgentTools(runtime) {
    return {
        expandViewNode: (/** @type {ExpandViewNodeToolInput} */ input) =>
            expandViewNode(runtime, input),
        collapseViewNode: (/** @type {CollapseViewNodeToolInput} */ input) =>
            collapseViewNode(runtime, input),
        setViewVisibility: (/** @type {SetViewVisibilityToolInput} */ input) =>
            setViewVisibility(runtime, input),
        clearViewVisibility: (
            /** @type {ClearViewVisibilityToolInput} */ input
        ) => clearViewVisibility(runtime, input),
        resolveSelectionAggregationCandidate: (
            /** @type {ResolveSelectionAggregationCandidateToolInput} */ input
        ) => resolveSelectionAggregationCandidateTool(runtime, input),
        submitIntentProgram: (
            /** @type {SubmitIntentProgramToolInput} */ input
        ) => submitIntentProgramTool(runtime, input),
    };
}

/**
 * Expands a collapsed view branch in the current session context.
 *
 * @param {AgentToolRuntime} runtime
 * @param {ExpandViewNodeToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function expandViewNode(runtime, input) {
    ensureResolvedView(runtime, input.selector);
    const before = runtime.isViewNodeExpanded(input.selector);
    runtime.expandViewNode(input.selector);
    const after = runtime.isViewNodeExpanded(input.selector);
    let text;
    if (before) {
        text = "The requested view branch was already expanded.";
    } else {
        text = "Expanded the requested view branch.";
    }

    return {
        text,
        content: createViewStateChange(
            "agent_context",
            "collapsed",
            input.selector,
            before,
            after
        ),
    };
}

/**
 * Collapses a previously expanded view branch in the current session context.
 *
 * @param {AgentToolRuntime} runtime
 * @param {CollapseViewNodeToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function collapseViewNode(runtime, input) {
    ensureResolvedView(runtime, input.selector);
    const before = runtime.isViewNodeExpanded(input.selector);
    runtime.collapseViewNode(input.selector);
    const after = runtime.isViewNodeExpanded(input.selector);
    let text;
    if (before) {
        text = "Collapsed the requested view branch.";
    } else {
        text = "The requested view branch was already collapsed.";
    }

    return {
        text,
        content: createViewStateChange(
            "agent_context",
            "collapsed",
            input.selector,
            before,
            after
        ),
    };
}

/**
 * Sets the configured visibility of a view.
 *
 * @param {AgentToolRuntime} runtime
 * @param {SetViewVisibilityToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function setViewVisibility(runtime, input) {
    ensureResolvedView(runtime, input.selector);
    const before = runtime.isViewVisible(input.selector);
    runtime.setViewVisibility(input.selector, input.visibility);
    const after = runtime.isViewVisible(input.selector);
    let text;
    if (after === before) {
        text = "The view was already in the requested visibility state.";
    } else {
        text = "Updated the requested view visibility.";
    }

    return {
        text,
        content: createViewStateChange(
            "user_visibility",
            "visible",
            input.selector,
            before,
            after
        ),
    };
}

/**
 * Clears the visibility override for a view.
 *
 * @param {AgentToolRuntime} runtime
 * @param {ClearViewVisibilityToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function clearViewVisibility(runtime, input) {
    ensureResolvedView(runtime, input.selector);
    const before = runtime.isViewVisible(input.selector);
    runtime.clearViewVisibility(input.selector);
    const after = runtime.isViewVisible(input.selector);
    let text;
    if (after === before) {
        text = "The visibility override was already clear.";
    } else {
        text = "Cleared the requested view visibility override.";
    }

    return {
        text,
        content: createViewStateChange(
            "user_visibility",
            "visible",
            input.selector,
            before,
            after
        ),
    };
}

/**
 * Resolves a selection aggregation candidate into an attribute identifier.
 *
 * @param {AgentToolRuntime} runtime
 * @param {ResolveSelectionAggregationCandidateToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function resolveSelectionAggregationCandidateTool(runtime, input) {
    let context;
    try {
        context = runtime.getAgentContext();
    } catch (error) {
        throw new ToolCallRejectionError(getErrorMessage(error));
    }

    let resolution;
    try {
        resolution = resolveSelectionAggregationCandidate(
            context,
            input.candidateId,
            input.aggregation
        );
    } catch (error) {
        throw new ToolCallRejectionError(getErrorMessage(error));
    }

    return {
        text:
            "Resolved " + resolution.title + " for " + input.candidateId + ".",
        content: resolution,
    };
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
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
