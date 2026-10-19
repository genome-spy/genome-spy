/** @type {import("../spec/config.js").DefaultThemeColors} */
export const DEFAULT_THEME_COLORS = Object.freeze({
    foreground: "black",
    stroke: "gray",
    grid: "lightgray",
    chromosomeTick: "#989898",
    symbolStroke: "#888",
    background: null,
});

/** @type {WeakSet<import("../spec/parameter.js").Parameter>} */
const automaticDeclarations = new WeakSet();

/** @param {import("../spec/parameter.js").Parameter} param */
export function isAutomaticDefaultThemeColors(param) {
    return automaticDeclarations.has(param);
}

/**
 * Supplies one ordinary palette declaration on the authored root.
 * Explicit declarations replace the whole palette and retain normal scope rules.
 *
 * @param {import("../spec/parameter.js").Parameter[]} [params]
 * @returns {import("../spec/parameter.js").Parameter[]}
 */
export function getDefaultThemeColorsParams(params = []) {
    const authored = params.find(
        (param) => param.name === "defaultThemeColors"
    );
    if (authored) {
        if (
            "select" in authored ||
            "ruler" in authored ||
            "bind" in authored ||
            "transition" in authored
        ) {
            throw new Error(
                'The "defaultThemeColors" parameter must declare a palette value or expression.'
            );
        }
        if (!("expr" in authored)) {
            validateDefaultThemeColors(authored.value);
        }
        return params;
    }

    const declaration = {
        name: "defaultThemeColors",
        value: { ...DEFAULT_THEME_COLORS },
    };
    automaticDeclarations.add(declaration);
    return [declaration, ...params];
}

/** @param {unknown} value */
export function validateDefaultThemeColors(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
            'The "defaultThemeColors" parameter must contain a complete palette object.'
        );
    }
    for (const key of Object.keys(DEFAULT_THEME_COLORS)) {
        const color = /** @type {Record<string, unknown>} */ (value)[key];
        if (
            !(key === "background" && color === null) &&
            typeof color !== "string"
        ) {
            throw new Error(
                'The "defaultThemeColors" palette requires a color for "' +
                    key +
                    '".'
            );
        }
    }
}
