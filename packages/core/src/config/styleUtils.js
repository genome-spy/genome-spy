/**
 * @param {string | string[] | undefined} style
 * @returns {string[]}
 */
export function normalizeStyle(style) {
    if (!style) {
        return [];
    }
    return Array.isArray(style) ? style : [style];
}
