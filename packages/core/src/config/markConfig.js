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
    const styles = normalizeStyle(style);

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
