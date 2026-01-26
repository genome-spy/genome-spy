import { embed } from "@genome-spy/core";
import { field } from "@genome-spy/core/utils/field.js";
import { boxplotStats } from "../utils/statistics/boxplot.js";

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
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 */

/**
 * @typedef {NonNullable<ReturnType<typeof boxplotStats>["statistics"]>} BoxplotStatistics
 */

/**
 * @typedef {BoxplotStatistics & Record<string, Scalar>} BoxplotStatsRow
 */

/**
 * @typedef {Record<string, any>} BoxplotOutlierRow
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
 * @template T
 * @param {T[]} data
 * @param {ResolvedBoxplotOptions} options
 * @returns {{ statsRows: BoxplotStatsRow[], outlierRows: BoxplotOutlierRow[] }}
 */
function computeBoxplotData(data, options) {
    const valueAccessor = field(options.valueField);
    const groupAccessor = field(options.groupField);

    /** @type {Map<import("@genome-spy/core/spec/channel.js").Scalar, T[]>} */
    const groups = new Map();

    for (const datum of data) {
        const group = groupAccessor(datum);
        let entries = groups.get(group);
        if (!entries) {
            entries = [];
            groups.set(group, entries);
        }
        entries.push(datum);
    }

    /** @type {BoxplotStatsRow[]} */
    const statsRows = [];
    /** @type {BoxplotOutlierRow[]} */
    const outlierRows = [];

    for (const [group, groupData] of groups) {
        const { statistics, outliers } = boxplotStats(
            groupData,
            valueAccessor,
            {
                coef: options.coef,
                dropNaN: options.dropNaN,
            }
        );

        if (statistics) {
            statsRows.push({
                [options.groupField]: group,
                ...statistics,
            });
        }

        for (const outlier of outliers) {
            const row = { ...outlier };
            row[options.groupField] = group;
            row[options.valueField] = valueAccessor(outlier);
            outlierRows.push(row);
        }
    }

    return { statsRows, outlierRows };
}

/**
 * @template T
 * @param {HTMLElement | string} el
 * @param {T[]} data
 * @param {BoxplotChartOptions} [options]
 * @returns {Promise<{
 *   api: import("@genome-spy/core/types/embedApi.js").EmbedResult,
 *   updateData: (nextData: T[]) => void
 * }>}
 */
export async function createBoxplotChart(el, data, options = {}) {
    const resolved = resolveOptions(options);
    const spec = buildBoxplotSpec(resolved);

    let embedOptions = resolved.embedOptions;
    if (!embedOptions) {
        embedOptions = {};
    }

    const api = await embed(el, spec, embedOptions);

    /**
     * @param {T[]} nextData
     */
    const updateData = (nextData) => {
        if (!Array.isArray(nextData)) {
            throw new Error("Boxplot chart expects an array of data.");
        }

        const { statsRows, outlierRows } = computeBoxplotData(
            nextData,
            resolved
        );

        api.updateNamedData(resolved.statsName, statsRows);
        api.updateNamedData(resolved.outliersName, outlierRows);
    };

    updateData(data);

    return { api, updateData };
}

/**
 * @param {BoxplotChartOptions} [options]
 * @returns {import("@genome-spy/core/spec/root.js").RootSpec}
 */
export function createBoxplotSpec(options = {}) {
    const resolved = resolveOptions(options);
    return buildBoxplotSpec(resolved);
}
