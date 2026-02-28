import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * Built-in themes. These can be selected with the `theme` property
 * in view specs (`"genomespy"` or `"vegalite"`).
 *
 * @type {Record<import("../spec/config.js").BuiltInThemeName, import("../spec/config.js").GenomeSpyConfig>}
 */
export const BUILT_IN_THEMES = {
    genomespy: {},
    vegalite: {
        view: {
            stroke: "#ddd",
            strokeWidth: 1,
        },
        axis: {
            grid: false,
            domain: false,
            tickColor: "#ddd",
            domainColor: "#ddd",
            gridColor: "#ddd",
            labelColor: "#333",
            titleColor: "#333",
            titleFontWeight: "normal",
        },
        axisQuantitative: {
            grid: true,
        },
        rect: {
            color: "#4c78a8",
            strokeWidth: 0,
        },
        scale: {
            nominalColorScheme: "tableau10",
            ordinalColorScheme: "blues",
            quantitativeColorScheme: "viridis",
        },
    },
};

/**
 * @type {import("../spec/config.js").BuiltInThemeName}
 */
export const DEFAULT_THEME_NAME = "genomespy";

/**
 * @param {import("../spec/config.js").BuiltInThemeName} name
 * @returns {import("../spec/config.js").GenomeSpyConfig}
 */
export function getBuiltInTheme(name) {
    return BUILT_IN_THEMES[name];
}

/**
 * @param {import("../spec/config.js").BuiltInThemeName | import("../spec/config.js").BuiltInThemeName[] | undefined} selection
 * @returns {import("../spec/config.js").GenomeSpyConfig | undefined}
 */
export function resolveThemeSelection(selection) {
    if (!selection) {
        return undefined;
    }

    const names = Array.isArray(selection) ? selection : [selection];
    const unknown = names.filter((name) => !(name in BUILT_IN_THEMES));
    if (unknown.length > 0) {
        throw new Error(
            'Unknown theme "' +
                unknown[0] +
                '". Available themes: ' +
                Object.keys(BUILT_IN_THEMES).join(", ")
        );
    }

    return /** @type {import("../spec/config.js").GenomeSpyConfig} */ (
        mergeConfigScopes(names.map((name) => BUILT_IN_THEMES[name]))
    );
}
