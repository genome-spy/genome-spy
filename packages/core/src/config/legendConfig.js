import { mergeConfigScopes } from "./mergeConfig.js";
import { normalizeStyle } from "./styleUtils.js";

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").Legend | import("../spec/legend.js").LegendConfig} [legend]
 * @returns {import("../spec/legend.js").LegendConfig}
 */
export function getConfiguredLegendDefaults(scopes, legend) {
    const styles = normalizeStyle(legend?.style);

    return /** @type {import("../spec/legend.js").LegendConfig} */ (
        mergeConfigScopes([
            ...scopes.flatMap((scope) => {
                const config = scope.legend;
                const configStyles = normalizeStyle(config?.style);

                return [
                    ...configStyles.map(
                        (styleName) =>
                            /** @type {Record<string, any> | undefined} */ (
                                scope.style?.[styleName]
                            )
                    ),
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
