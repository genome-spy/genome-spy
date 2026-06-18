import { mergeConfigScopes } from "./mergeConfig.js";
import { getConfiguredStyleConfig as getStyleConfig } from "./styleUtils.js";

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
    return getStyleConfig(scopes, styleName);
}
