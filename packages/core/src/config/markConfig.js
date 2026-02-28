import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/mark.js").MarkType} markType
 * @returns {Record<string, any>}
 */
export function getConfiguredMarkDefaults(scopes, markType) {
    return mergeConfigScopes(
        scopes.flatMap((scope) => [
            /** @type {Record<string, any> | undefined} */ (scope.mark),
            /** @type {Record<string, any> | undefined} */ (scope[markType]),
        ])
    );
}
