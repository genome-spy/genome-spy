import { mergeConfigScopes } from "./mergeConfig.js";
import { normalizeStyle } from "./styleUtils.js";

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
    const styles = normalizeStyle(styleName);
    if (styles.length == 0) {
        return {};
    }

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
