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
 * @param {import("../spec/view.js").ViewBackground} [explicitViewBackground]
 * @returns {import("../spec/view.js").ViewBackground}
 */
export function getConfiguredViewBackground(scopes, explicitViewBackground) {
    // Mirrors Vega-Lite behavior: view backgrounds use the implicit "cell"
    // style, and explicit view.style entries augment it.
    const styles = ["cell", ...normalizeStyle(explicitViewBackground?.style)];

    return /** @type {import("../spec/view.js").ViewBackground} */ (
        mergeConfigScopes(
            scopes
                .flatMap((scope) => [
                    /** @type {Record<string, any> | undefined} */ (scope.view),
                    ...styles.map(
                        (styleName) =>
                            /** @type {Record<string, any> | undefined} */ (
                                scope.style?.[styleName]
                            )
                    ),
                ])
                .concat([explicitViewBackground])
        )
    );
}
