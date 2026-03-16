import { mergeConfigScopes } from "./mergeConfig.js";
import { normalizeStyle } from "./styleUtils.js";

/**
 * Tick is syntactic sugar for rule and therefore resolves through the same
 * config/style buckets.
 *
 * @param {import("../spec/mark.js").MarkType} markType
 * @returns {"point" | "rect" | "rule" | "text" | "link"}
 */
function getConfigMarkType(markType) {
    return markType == "tick" ? "rule" : markType;
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/mark.js").MarkType} markType
 * @param {string | string[] | undefined} style
 * @returns {Record<string, any>}
 */
export function getConfiguredMarkDefaults(scopes, markType, style) {
    const configMarkType = getConfigMarkType(markType);

    // Match Vega-Lite-like behavior: mark-type style (e.g. "point") is always
    // part of style resolution, and explicit mark.style entries augment it.
    const styles = [configMarkType, ...normalizeStyle(style)];

    return mergeConfigScopes(
        scopes.flatMap((scope) => [
            /** @type {Record<string, any> | undefined} */ (scope.mark),
            /** @type {Record<string, any> | undefined} */ (
                scope[configMarkType]
            ),
            ...styles.map(
                (styleName) =>
                    /** @type {Record<string, any> | undefined} */ (
                        scope.style?.[styleName]
                    )
            ),
        ])
    );
}
