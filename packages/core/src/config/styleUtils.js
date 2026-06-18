import { mergeConfigScopes } from "./mergeConfig.js";

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

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {string | string[] | undefined} style
 * @returns {import("../spec/config.js").StyleConfig}
 */
export function getConfiguredStyleConfig(scopes, style) {
    const styles = normalizeStyle(style);

    return /** @type {import("../spec/config.js").StyleConfig} */ (
        mergeConfigScopes(
            scopes.flatMap((scope) =>
                styles.map(
                    (styleName) =>
                        /** @type {Record<string, any> | undefined} */ (
                            scope.style?.[styleName]
                        )
                )
            )
        )
    );
}
