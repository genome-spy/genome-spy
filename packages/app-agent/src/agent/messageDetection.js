/**
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeStructuredToolMessage(text) {
    const stripped = text.trimStart();
    return (
        stripped.startsWith("{") ||
        stripped.startsWith("[") ||
        stripped.startsWith("```") ||
        /^"[^"]+"\s*:/.test(stripped)
    );
}
