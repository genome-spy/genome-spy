import { mergeConfigScopes } from "./mergeConfig.js";

/** @type {import("../spec/config.js").GenomeSpyConfig} */
const VEGALITE_THEME = {
    mark: {
        color: "#4c78a8",
    },
    point: {
        filled: false,
        size: 30,
    },
    rule: {
        color: "black",
    },
    text: {
        color: "black",
    },
    view: {
        stroke: "#ddd",
        strokeWidth: 1,
    },
    axis: {
        grid: false,
        domain: true,
        tickColor: "gray",
        domainColor: "gray",
        gridColor: "#ddd",
        labelColor: "#333",
        titleColor: "#333",
        titleFontSize: 11,
        titleFontWeight: "normal",
    },
    axisQuantitative: {
        grid: true,
    },
    scale: {
        nominalColorScheme: "tableau10",
        ordinalColorScheme: "blues",
        quantitativeColorScheme: "blues",
    },
    range: {
        heatmap: "viridis",
        ramp: "blues",
        diverging: "blueorange",
    },
};

/**
 * Built-in themes. These can be selected with the `theme` property
 * in view specs.
 *
 * TODO: Vega themes include additional properties (for example legend config,
 * top-level background, and custom categorical range arrays) that are not yet
 * configurable through GenomeSpy's theme/config surface.
 *
 * @type {Record<import("../spec/config.js").BuiltInThemeName, import("../spec/config.js").GenomeSpyConfig>}
 */
export const BUILT_IN_THEMES = {
    genomespy: {},
    vegalite: VEGALITE_THEME,
    quartz: mergeConfigScopes([
        VEGALITE_THEME,
        {
            view: {
                fill: "#f9f9f9",
            },
            mark: {
                color: "#ab5787",
            },
            point: {
                size: 30,
            },
            axis: {
                domainColor: "#979797",
                domainWidth: 0.5,
                gridWidth: 0.2,
                labelColor: "#979797",
                tickColor: "#979797",
                tickWidth: 0.2,
                titleColor: "#979797",
            },
            axisX: {
                grid: true,
                tickSize: 10,
            },
            axisY: {
                domain: false,
                grid: true,
                tickSize: 0,
            },
        },
    ]),
    dark: mergeConfigScopes([
        VEGALITE_THEME,
        {
            view: {
                fill: "#333",
                stroke: "#888",
            },
            title: {
                color: "#fff",
            },
            axis: {
                domainColor: "#fff",
                gridColor: "#888",
                tickColor: "#fff",
                labelColor: "#fff",
                titleColor: "#fff",
            },
            text: {
                color: "#fff",
            },
            rule: {
                color: "#fff",
            },
        },
    ]),
    fivethirtyeight: mergeConfigScopes([
        VEGALITE_THEME,
        {
            view: {
                fill: "#f0f0f0",
            },
            mark: {
                color: "#30a2da",
            },
            axis: {
                domainColor: "#cbcbcb",
                grid: true,
                gridColor: "#cbcbcb",
                gridWidth: 1,
                labelColor: "#999",
                labelFontSize: 10,
                titleColor: "#333",
                tickColor: "#cbcbcb",
                tickSize: 10,
                titleFontSize: 14,
                titlePadding: 10,
                labelPadding: 4,
            },
            axisNominal: {
                grid: false,
            },
            axisOrdinal: {
                grid: false,
            },
            title: {
                anchor: "start",
                fontSize: 24,
                fontWeight: 600,
                offset: 20,
            },
        },
    ]),
    urbaninstitute: mergeConfigScopes([
        VEGALITE_THEME,
        {
            view: {
                fill: "#FFFFFF",
                stroke: "transparent",
            },
            mark: {
                color: "#1696d2",
            },
            point: {
                filled: true,
            },
            text: {
                font: "Lato",
                color: "#1696d2",
                size: 11,
                align: "center",
                fontWeight: 400,
            },
            title: {
                anchor: "start",
                fontSize: 18,
                font: "Lato",
            },
            axisX: {
                domain: true,
                domainColor: "#000000",
                domainWidth: 1,
                grid: false,
                labelFontSize: 12,
                labelFont: "Lato",
                labelAngle: 0,
                tickColor: "#000000",
                tickSize: 5,
                titleFontSize: 12,
                titlePadding: 10,
                titleFont: "Lato",
            },
            axisY: {
                domain: false,
                domainWidth: 1,
                grid: true,
                gridColor: "#DEDDDD",
                gridWidth: 1,
                labelFontSize: 12,
                labelFont: "Lato",
                labelPadding: 8,
                ticks: false,
                titleFontSize: 12,
                titlePadding: 10,
                titleFont: "Lato",
            },
        },
    ]),
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
