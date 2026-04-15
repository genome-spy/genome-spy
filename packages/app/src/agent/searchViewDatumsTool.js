import { getEncodingSearchFields } from "@genome-spy/core/encoder/metadataChannels.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * @typedef {import("./agentToolInputs.d.ts").SearchViewDatumsToolInput} SearchViewDatumsToolInput
 * @typedef {import("./types.d.ts").IntentBatchSummaryLine} IntentBatchSummaryLine
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {{
 *     resolveViewSelector(selector: ViewSelector): import("@genome-spy/core/view/view.js").default | undefined;
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
    if (typeof input.query !== "string" || input.query.length === 0) {
        throw new ToolCallRejectionError("Query must be a non-empty string.");
    }

    const mode = input.mode ?? "exact";
    if (mode !== "exact" && mode !== "prefix") {
        throw new ToolCallRejectionError(
            "Mode must be either exact or prefix when provided."
        );
    }

    // Keep the result set bounded even though the provider-facing contract
    // does not expose a limit argument.
    const limit = 10;

    const view = ensureResolvedView(runtime, input.selector);
    const searchAccessors = selectSearchAccessors(view, input.field);
    const data = ensureSearchableData(view);
    const collator = new Intl.Collator("en", {
        usage: "search",
        sensitivity: "base",
    });

    /** @type {any[]} */
    const matches = [];
    for (const datum of data) {
        if (
            datumMatchesSearchTerm(
                datum,
                searchAccessors,
                input.query,
                mode,
                collator
            )
        ) {
            matches.push(datum);
            if (matches.length >= limit) {
                break;
            }
        }
    }

    return {
        text:
            matches.length > 0
                ? `Found ${matches.length} matching datum${matches.length === 1 ? "" : "s"}.`
                : "No matching datums were found.",
        content: {
            kind: "datum_lookup_result",
            selector: input.selector,
            query: input.query,
            mode,
            count: matches.length,
            matches,
        },
    };
}

/**
 * @param {SearchViewDatumsToolRuntime} runtime
 * @param {ViewSelector} selector
 * @returns {import("@genome-spy/core/view/view.js").default}
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
 * @param {any} view
 * @param {string | undefined} field
 * @returns {import("vega-util").AccessorFn[]}
 */
function selectSearchAccessors(view, field) {
    if (typeof view?.getSearchAccessors !== "function") {
        throw new ToolCallRejectionError(
            "The requested view does not expose searchable fields."
        );
    }

    const accessors = view.getSearchAccessors();
    if (!Array.isArray(accessors) || accessors.length === 0) {
        throw new ToolCallRejectionError(
            "The requested view does not expose searchable fields."
        );
    }

    if (field === undefined || field === "") {
        return accessors;
    }

    if (typeof field !== "string" || field.length === 0) {
        throw new ToolCallRejectionError(
            "Field must be a non-empty string when provided."
        );
    }

    const searchFields = getSearchFields(view);
    const fieldIndex = searchFields.indexOf(field);
    if (fieldIndex < 0) {
        throw new ToolCallRejectionError(
            "The requested view does not search the field " + field + "."
        );
    }

    return [accessors[fieldIndex]];
}

/**
 * @param {any} view
 * @returns {Iterable<any>}
 */
function ensureSearchableData(view) {
    const collector = view?.getCollector?.();
    const data = collector?.getData?.();
    if (!data) {
        throw new ToolCallRejectionError(
            "The requested view does not expose searchable data."
        );
    }

    return data;
}

/**
 * @param {any} view
 * @returns {string[]}
 */
function getSearchFields(view) {
    const encoding = view.getEncoding?.();
    const searchFields =
        encoding && typeof encoding === "object"
            ? /** @type {string[]} */ (getEncodingSearchFields(encoding) ?? [])
            : [];

    if (searchFields.length === 0) {
        throw new ToolCallRejectionError(
            "The requested view does not expose searchable fields."
        );
    }

    return searchFields;
}

/**
 * @param {any} datum
 * @param {import("vega-util").AccessorFn[]} accessors
 * @param {string} query
 * @param {"exact" | "prefix"} mode
 * @param {Intl.Collator} collator
 * @returns {boolean}
 */
function datumMatchesSearchTerm(datum, accessors, query, mode, collator) {
    for (const accessor of accessors) {
        const value = accessor(datum);
        if (value !== null && value !== undefined) {
            const stringValue = String(value);
            if (
                mode === "exact" &&
                collator.compare(stringValue, query) === 0
            ) {
                return true;
            }

            if (
                mode === "prefix" &&
                stringValue.length >= query.length &&
                // TODO: Avoid slicing in the hot path. This allocates a lot of
                // short-lived garbage on large datasets.
                collator.compare(stringValue.slice(0, query.length), query) ===
                    0
            ) {
                return true;
            }
        }
    }

    return false;
}
