import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").Legend | import("../spec/legend.js").LegendConfig} [legend]
 * @returns {import("../spec/legend.js").LegendConfig}
 */
export function getConfiguredLegendDefaults(scopes, legend) {
    return /** @type {import("../spec/legend.js").LegendConfig} */ (
        mergeConfigScopes([
            ...scopes.map((scope) => scope.legend),
            legend ?? undefined,
        ])
    );
}
