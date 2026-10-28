import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * @typedef {import("./agentToolInputs.d.ts").SearchViewDatumsToolInput} SearchViewDatumsToolInput
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {{
 *     agentApi: import("@genome-spy/app/agentApi").AgentApi;
 * }} SearchViewDatumsToolRuntime
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Looks up datum objects in one searchable view.
 *
 * @param {SearchViewDatumsToolRuntime} runtime
 * @param {SearchViewDatumsToolInput} input
 * @returns {AgentToolExecutionResult}
 */
export function searchViewDatumsTool(runtime, input) {
    const mode = input.mode ?? "exact";
    try {
        const view = runtime.agentApi.getViewApi().get(input.selector);
        const result = runtime.agentApi
            .getDatumSearch()
            .findDatums(input.query, {
                view,
                field: input.field === "*" ? undefined : input.field,
                mode,
                limit: 10,
            });
        const matches = result.matches.map((match) => match.datum);
        return {
            text:
                matches.length > 0
                    ? `Found ${matches.length} matching datum${matches.length === 1 ? "" : "s"}.` +
                      (result.truncated ? " More loaded matches exist." : "")
                    : "No matching loaded datums were found.",
            content: {
                kind: "datum_lookup_result",
                selector: input.selector,
                query: input.query,
                mode,
                count: matches.length,
                matches,
                truncated: result.truncated,
                // Only serializable source status crosses the provider boundary;
                // public handles and scale capabilities stay in the browser.
                sources: result.sources.map(
                    ({ view: sourceView, ...source }) => ({
                        ...source,
                        selector: sourceView.selector,
                    })
                ),
            },
        };
    } catch (error) {
        throw new ToolCallRejectionError(
            error instanceof Error ? error.message : String(error)
        );
    }
}
