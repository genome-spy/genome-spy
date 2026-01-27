/** @type {BoxplotChartOptions} */
const DEFAULT_OPTIONS = Object.freeze({
    statsName: "boxplot_stats",
    outliersName: "boxplot_outliers",
    groupField: "group",
    valueField: "value",
    groupType: "nominal",
    bandPadding: 0.3,
    groupTitle: undefined,
    valueTitle: undefined,
    width: undefined,
    height: undefined,
    embedOptions: undefined,
    coef: undefined,
    dropNaN: undefined,
});

/**
 * @typedef {object} BoxplotChartOptions
 * @prop {string} [statsName]
 * @prop {string} [outliersName]
 * @prop {string} [groupField]
 * @prop {string} [valueField]
 * @prop {import("@genome-spy/core/spec/channel.js").Type} [groupType]
 * @prop {number} [bandPadding]
 * @prop {string} [groupTitle]
 * @prop {string | null} [valueTitle]
 * @prop {number} [width]
 * @prop {number} [height]
 * @prop {import("@genome-spy/core/types/embedApi.js").EmbedOptions} [embedOptions]
 * @prop {number} [coef]
 * @prop {boolean} [dropNaN]
 */

/**
 * @typedef {import("./boxplotTypes.d.ts").BoxplotStatsRow} BoxplotStatsRow
 * @typedef {import("./boxplotTypes.d.ts").BoxplotOutlierRow} BoxplotOutlierRow
 */

/**
 * @typedef {BoxplotChartOptions & {
 *   statsName: string,
 *   outliersName: string,
 *   groupField: string,
 *   valueField: string,
 *   groupType: import("@genome-spy/core/spec/channel.js").Type,
 *   bandPadding: number,
 *   groupTitle: string,
 *   valueTitle: string | null
 * }} ResolvedBoxplotOptions
 */

/**
 * @param {BoxplotChartOptions} [options]
 * @returns {ResolvedBoxplotOptions}
 */
function resolveOptions(options = {}) {
    /** @type {ResolvedBoxplotOptions} */
    const resolved = { ...DEFAULT_OPTIONS, ...options };

    if (resolved.groupTitle === undefined) {
        resolved.groupTitle = resolved.groupField;
    }

    if (resolved.valueTitle === undefined) {
        resolved.valueTitle = resolved.valueField;
    }

    return resolved;
}

/**
 * @param {ResolvedBoxplotOptions} options
 * @returns {import("@genome-spy/core/spec/root.js").RootSpec}
 */
function buildBoxplotSpec(options) {
    const groupField = options.groupField;
    const valueField = options.valueField;
    const axisTitle = options.valueTitle;

    /** @type {import("@genome-spy/core/spec/view.js").LayerSpec} */
    const spec = {
        data: { name: options.statsName },
        encoding: {
            x: {
                field: groupField,
                type: options.groupType,
                scale: { padding: options.bandPadding },
                title: options.groupTitle,
            },
        },
        layer: [],
    };

    if (options.width != null) {
        spec.width = options.width;
    }

    if (options.height != null) {
        spec.height = options.height;
    }

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const outliersLayer = {
        name: "outliers",
        data: { name: options.outliersName },
        mark: {
            type: "point",
            filled: false,
            size: 30,
            stroke: "black",
            opacity: 0.5,
            tooltip: null,
        },
        encoding: {
            y: {
                field: valueField,
                type: "quantitative",
            },
        },
    };

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const whiskersLayer = {
        name: "whiskers",
        transform: [
            {
                type: "formula",
                expr: "datum.q1",
                as: "lowerQuantile",
            },
            {
                type: "formula",
                expr: "datum.q3",
                as: "upperQuantile",
            },
            {
                type: "regexFold",
                columnRegex: ["^(.*)Quantile$", "^(.*)Whisker$"],
                asValue: ["quantile", "whisker"],
                asKey: "which",
            },
        ],
        mark: {
            type: "rule",
            tooltip: null,
        },
        encoding: {
            y: {
                field: "quantile",
                type: "quantitative",
            },
            y2: {
                field: "whisker",
            },
        },
    };

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const boxLayer = {
        name: "box",
        mark: {
            type: "rect",
            stroke: "black",
            strokeWidth: 1,
            fill: "#ccd5ae",
        },
        encoding: {
            y: {
                field: "q3",
                type: "quantitative",
                axis: {
                    title: axisTitle,
                },
            },
            y2: {
                field: "q1",
            },
        },
    };

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const medianLayer = {
        name: "median",
        mark: {
            type: "rule",
            color: "black",
            size: 2,
            strokeCap: "butt",
            tooltip: null,
        },
        encoding: {
            y: {
                field: "median",
                type: "quantitative",
            },
            x: {
                field: groupField,
                type: options.groupType,
                band: 0,
                title: options.groupTitle,
            },
            x2: {
                field: groupField,
                band: 1,
            },
        },
    };

    spec.layer.push(outliersLayer, whiskersLayer, boxLayer, medianLayer);

    return spec;
}

/**
 * @param {BoxplotChartOptions} [options]
 * @returns {import("@genome-spy/core/spec/root.js").RootSpec}
 */
export function createBoxplotSpec(options = {}) {
    const resolved = resolveOptions(options);
    return buildBoxplotSpec(resolved);
}
