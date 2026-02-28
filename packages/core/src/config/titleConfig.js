import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @returns {import("../spec/config.js").TitleConfig}
 */
export function getConfiguredTitleConfig(scopes) {
    return /** @type {import("../spec/config.js").TitleConfig} */ (
        mergeConfigScopes(
            scopes.map(
                (scope) =>
                    /** @type {Record<string, any> | undefined} */ (scope.title)
            )
        )
    );
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {string | string[]} [styleName]
 * @returns {import("../spec/config.js").StyleConfig}
 */
export function getConfiguredStyleConfig(scopes, styleName) {
    if (!styleName) {
        return {};
    }

    const styles = Array.isArray(styleName) ? styleName : [styleName];

    return /** @type {import("../spec/config.js").StyleConfig} */ (
        mergeConfigScopes(
            scopes.flatMap((scope) =>
                styles.map(
                    (name) =>
                        /** @type {Record<string, any> | undefined} */ (
                            scope.style?.[name]
                        )
                )
            )
        )
    );
}
