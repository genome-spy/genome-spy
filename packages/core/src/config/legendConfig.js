import { mergeConfigScopes } from "./mergeConfig.js";
import { getConfiguredStyleConfig, normalizeStyle } from "./styleUtils.js";

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").Legend | import("../spec/legend.js").LegendConfig} [legend]
 * @returns {import("../spec/legend.js").LegendConfig}
 */
export function getConfiguredLegendDefaults(scopes, legend) {
    const styles = normalizeStyle(legend?.style);

    return /** @type {import("../spec/legend.js").LegendConfig} */ (
        mergeConfigScopes([
            ...scopes.flatMap((scope, index) => {
                const config = scope.legend;
                const configStyle = getConfiguredStyleConfig(
                    scopes.slice(0, index + 1),
                    config?.style
                );

                return [
                    configStyle,
                    config,
                    ...styles.map(
                        (styleName) =>
                            /** @type {Record<string, any> | undefined} */ (
                                scope.style?.[styleName]
                            )
                    ),
                ];
            }),
            legend,
        ])
    );
}
