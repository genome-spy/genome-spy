import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/view.js").ViewBackground} [explicitViewBackground]
 * @returns {import("../spec/view.js").ViewBackground}
 */
export function getConfiguredViewBackground(scopes, explicitViewBackground) {
    return /** @type {import("../spec/view.js").ViewBackground} */ (
        mergeConfigScopes([
            ...scopes.map(
                (scope) =>
                    /** @type {Record<string, any> | undefined} */ (scope.view)
            ),
            explicitViewBackground,
        ])
    );
}
