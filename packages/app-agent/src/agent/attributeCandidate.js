import { buildSelectionAggregationAttribute } from "./selectionAggregationTool.js";
import { ToolCallRejectionError } from "./agentToolErrors.js";

/**
 * Resolves a compact agent-facing attribute candidate into the canonical app
 * AttributeIdentifier shape.
 *
 * @param {{
 *     getAgentVolatileContext(): import("./types.d.ts").AgentVolatileContext;
 * }} runtime
 * @param {import("./agentToolInputs.d.ts").AgentAttributeCandidate} candidate
 * @returns {import("@genome-spy/app/agentShared").AttributeIdentifier}
 */
export function resolveAgentAttributeCandidate(runtime, candidate) {
    return resolveAgentAttributeCandidateRecord(runtime, candidate).resolved;
}

/**
 * Resolves a compact agent-facing attribute candidate and records the input
 * basis for later turns.
 *
 * @param {{
 *     getAgentVolatileContext(): import("./types.d.ts").AgentVolatileContext;
 * }} runtime
 * @param {import("./agentToolInputs.d.ts").AgentAttributeCandidate} candidate
 * @returns {{
 *     input: import("./agentToolInputs.d.ts").AgentAttributeCandidate;
 *     resolved: import("@genome-spy/app/agentShared").AttributeIdentifier;
 *     interval?: [AgentChromosomalLocus, AgentChromosomalLocus];
 * }}
 */
export function resolveAgentAttributeCandidateRecord(runtime, candidate) {
    if (candidate.type === "SAMPLE_ATTRIBUTE") {
        /** @type {import("@genome-spy/app/agentShared").AttributeIdentifier} */
        const resolved = {
            type: "SAMPLE_ATTRIBUTE",
            specifier: candidate.specifier,
        };

        return {
            input: candidate,
            resolved,
        };
    }

    if (candidate.type === "SELECTION_AGGREGATION") {
        const volatileContext = runtime.getAgentVolatileContext();
        const resolution = buildSelectionAggregationAttribute(
            volatileContext,
            candidate.candidateId,
            candidate.aggregation
        );
        const interval = findSelectionInterval(
            volatileContext,
            resolution.selectionSelector
        );

        return {
            input: candidate,
            resolved: resolution.attribute,
            ...(interval ? { interval } : {}),
        };
    }

    throw new ToolCallRejectionError("Unsupported attribute candidate type.");
}

/**
 * @typedef {{ chrom: string; pos: number }} AgentChromosomalLocus
 */

/**
 * @param {import("./types.d.ts").AgentVolatileContext} volatileContext
 * @param {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} selector
 * @returns {[AgentChromosomalLocus, AgentChromosomalLocus] | undefined}
 */
function findSelectionInterval(volatileContext, selector) {
    const parameterValue = (volatileContext.parameterValues ?? []).find(
        (entry) => isSameParamSelector(entry.selector, selector)
    );
    const interval = extractXInterval(parameterValue?.value);
    if (!interval) {
        return undefined;
    }

    const start = toAgentChromosomalLocus(interval[0]);
    const end = toAgentChromosomalLocus(interval[1]);
    return start && end ? [start, end] : undefined;
}

/**
 * @param {unknown} value
 * @returns {unknown[] | undefined}
 */
function extractXInterval(value) {
    if (
        value &&
        typeof value === "object" &&
        "intervals" in value &&
        value.intervals &&
        typeof value.intervals === "object"
    ) {
        const intervals = /** @type {any} */ (value.intervals);
        if (Array.isArray(intervals.x) && intervals.x.length === 2) {
            return intervals.x;
        }
    }

    return undefined;
}

/**
 * @param {unknown} value
 * @returns {AgentChromosomalLocus | undefined}
 */
function toAgentChromosomalLocus(value) {
    if (
        value &&
        typeof value === "object" &&
        "chrom" in value &&
        typeof value.chrom === "string" &&
        "pos" in value &&
        typeof value.pos === "number"
    ) {
        return {
            chrom: value.chrom,
            pos: value.pos,
        };
    }

    return undefined;
}

/**
 * @param {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} a
 * @param {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} b
 * @returns {boolean}
 */
function isSameParamSelector(a, b) {
    return (
        a.param === b.param &&
        JSON.stringify(a.scope) === JSON.stringify(b.scope)
    );
}
