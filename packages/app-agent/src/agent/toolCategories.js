/**
 * Canonical tool-kind values shared by generated tool metadata, runtime tool
 * descriptions, and prompt-alignment tests.
 */
export const TOOL_KINDS = /** @type {const} */ (["do", "know"]);

/**
 * Canonical tool-subkind values shared by generated tool metadata, runtime
 * tool descriptions, and prompt-alignment tests.
 */
export const TOOL_SUBKINDS = /** @type {const} */ ([
    "context",
    "state_change",
    "plot",
    "find",
    "learn",
    "study",
]);

/**
 * @typedef {"do" | "know"} ToolKind
 */

/**
 * @typedef {"context" | "state_change" | "plot" | "find" | "learn" | "study"} ToolSubkind
 */

/**
 * @param {string} value
 * @returns {value is ToolKind}
 */
export function isToolKind(value) {
    return TOOL_KINDS.includes(/** @type {ToolKind} */ (value));
}

/**
 * @param {string} value
 * @returns {value is ToolSubkind}
 */
export function isToolSubkind(value) {
    return TOOL_SUBKINDS.includes(/** @type {ToolSubkind} */ (value));
}

/**
 * @param {ToolKind} kind
 * @returns {string}
 */
export function formatToolKindLabel(kind) {
    return kind === "do" ? "Do tool" : "Know tool";
}

/**
 * @param {ToolSubkind} subkind
 * @returns {string}
 */
export function formatToolSubkindLabel(subkind) {
    return subkind.replaceAll("_", " ");
}
