/**
 * Maximum number of rejected tool-call rounds allowed per user turn when the
 * agent keeps varying the payload.
 */
export const MAX_REJECTED_TOOL_CALL_RETRIES = 4;

/**
 * Maximum number of consecutive repeats of the exact same rejected tool-call
 * signature before the loop is stopped early.
 */
export const MAX_REPEATED_REJECTED_TOOL_CALL_REPEATS = 1;

/**
 * @typedef {import("./types.d.ts").AgentToolCall} AgentToolCall
 */

/**
 * Produces a stable signature for a batch of tool calls so repeated malformed
 * payloads can be detected even if the provider changes call ids or object key
 * order.
 *
 * @param {AgentToolCall[]} toolCalls
 * @returns {string}
 */
export function serializeToolCallSignature(toolCalls) {
    return JSON.stringify(
        toolCalls.map((toolCall) => ({
            name: toolCall.name,
            arguments: normalizeToolCallValue(toolCall.arguments),
        }))
    );
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeToolCallValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeToolCallValue(item));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
        return value;
    }

    /** @type {Record<string, unknown>} */
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
        normalized[key] = normalizeToolCallValue(
            /** @type {Record<string, unknown>} */ (value)[key]
        );
    }

    return normalized;
}
