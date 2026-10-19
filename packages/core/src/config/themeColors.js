/** @type {import("../spec/config.js").ThemeColors} */
export const DEFAULT_THEME_COLORS = Object.freeze({
    foreground: "black",
    stroke: "gray",
    grid: "lightgray",
    chromosomeTick: "#989898",
    symbolStroke: "#888",
    background: null,
});

/**
 * Supplies one ordinary palette declaration on the authored root.
 * Explicit declarations replace the whole palette and retain normal scope rules.
 *
 * @param {import("../spec/parameter.js").Parameter[]} [params]
 * @returns {import("../spec/parameter.js").Parameter[]}
 */
export function getThemeColorsParams(params = []) {
    const authored = params.find((param) => param.name === "themeColors");
    if (authored) {
        if (
            "select" in authored ||
            "ruler" in authored ||
            "bind" in authored ||
            "transition" in authored
        ) {
            throw new Error(
                'The "themeColors" parameter must declare a palette value or expression.'
            );
        }
        if (!("expr" in authored)) {
            validateThemeColors(authored.value);
        }
        return params;
    }

    return [
        {
            name: "themeColors",
            value: { ...DEFAULT_THEME_COLORS },
        },
        ...params,
    ];
}

/** @param {unknown} value */
export function validateThemeColors(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
            'The "themeColors" parameter must contain a complete palette object.'
        );
    }
    for (const key of Object.keys(DEFAULT_THEME_COLORS)) {
        const color = /** @type {Record<string, unknown>} */ (value)[key];
        if (
            !(key === "background" && color === null) &&
            typeof color !== "string"
        ) {
            throw new Error(
                'The "themeColors" palette requires a color for "' + key + '".'
            );
        }
    }
}
