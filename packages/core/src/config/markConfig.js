import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * @param {string | string[] | undefined} style
 * @returns {string[]}
 */
function normalizeStyle(style) {
    if (!style) {
        return [];
    }
    return Array.isArray(style) ? style : [style];
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/mark.js").MarkType} markType
 * @param {string | string[] | undefined} style
 * @returns {Record<string, any>}
 */
export function getConfiguredMarkDefaults(scopes, markType, style) {
    // Match Vega-Lite-like behavior: mark-type style (e.g. "point") is always
    // part of style resolution, and explicit mark.style entries augment it.
    const styles = [markType, ...normalizeStyle(style)];

    return mergeConfigScopes(
        scopes.flatMap((scope) => [
            /** @type {Record<string, any> | undefined} */ (scope.mark),
            /** @type {Record<string, any> | undefined} */ (scope[markType]),
            ...styles.map(
                (styleName) =>
                    /** @type {Record<string, any> | undefined} */ (
                        scope.style?.[styleName]
                    )
            ),
        ])
    );
}
