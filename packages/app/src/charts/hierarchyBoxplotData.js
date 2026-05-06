import { boxplotStats } from "../utils/statistics/boxplot.js";
import { getFlattenedGroupHierarchy } from "../sampleView/state/sampleSlice.js";
import { extractAttributeValues } from "../sampleView/attributeValues.js";
import {
    getAttributeScope,
    getGroupLabel,
    getGroupSamples,
} from "./chartDataUtils.js";

const DEFAULT_OPTIONS = Object.freeze({
    groupField: "group",
    valueField: "value",
    sampleField: "sample",
    groupLabelSeparator: " / ",
    coef: undefined,
    dropNaN: undefined,
});

/**
 * @typedef {object} HierarchyBoxplotOptions
 * @prop {string} [groupField]
 * @prop {string} [valueField]
 * @prop {string} [sampleField]
 * @prop {string} [groupLabelSeparator]
 * @prop {number} [coef]
 * @prop {boolean} [dropNaN]
 */

/**
 * @typedef {HierarchyBoxplotOptions & {
 *   groupField: string,
 *   valueField: string,
 *   sampleField: string,
 *   groupLabelSeparator: string
 * }} ResolvedHierarchyBoxplotOptions
 */

/**
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @param {HierarchyBoxplotOptions} [options]
 * @returns {{
 *   statsRows: import("./boxplotTypes.d.ts").BoxplotStatsRow[],
 *   outlierRows: import("./boxplotTypes.d.ts").BoxplotOutlierRow[],
 *   groupDomain: import("@genome-spy/core/spec/channel.js").Scalar[],
 *   sampleCount: number,
 *   nonMissingCount: number,
 *   missingCount: number,
 *   groupSummaries: Array<{
 *       title: string,
 *       sampleCount: number,
 *       nonMissingCount: number,
 *       missingCount: number,
 *       min: number,
 *       q1: number,
 *       median: number,
 *       q3: number,
 *       max: number,
 *       iqr: number,
 *       outlierCount: number
 *   }>
 * }}
 */
export function buildHierarchyBoxplotData(
    sampleHierarchy,
    attributeInfo,
    options = {}
) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    if (attributeInfo.type !== "quantitative") {
        throw new Error("Boxplot requires a quantitative attribute.");
    }

    const specifier = attributeInfo.attribute.specifier;
    if (
        typeof specifier === "string" &&
        !sampleHierarchy.sampleMetadata.attributeNames.includes(specifier)
    ) {
        throw new Error("Unknown metadata attribute: " + String(specifier));
    }

    /** @type {ResolvedHierarchyBoxplotOptions} */
    const resolved = { ...DEFAULT_OPTIONS, ...options };

    const statsRows = [];
    const outlierRows = [];
    const groupDomain = [];
    const groupSummaries = [];
    const attributeScope = getAttributeScope(attributeInfo);
    let sampleCount = 0;
    let nonMissingCount = 0;
    let missingCount = 0;

    for (const path of getFlattenedGroupHierarchy(sampleHierarchy)) {
        const groupLabel = getGroupLabel(path, resolved.groupLabelSeparator);
        const sampleIds = getGroupSamples(path);
        sampleCount += sampleIds.length;
        const values = extractAttributeValues(
            attributeInfo,
            sampleIds,
            sampleHierarchy,
            attributeScope
        );
        if (values.length !== sampleIds.length) {
            throw new Error(
                "Attribute values length does not match sample ids."
            );
        }

        const sampleRows = sampleIds.map((sampleId, index) => ({
            [resolved.sampleField]: sampleId,
            [resolved.valueField]: values[index],
        }));

        if (sampleRows.length === 0) {
            continue;
        }

        const { statistics, outliers } = boxplotStats(
            sampleRows,
            (datum) => datum[resolved.valueField],
            {
                coef: resolved.coef,
                dropNaN: resolved.dropNaN,
            }
        );

        if (statistics) {
            nonMissingCount += statistics.nValid;
            missingCount += statistics.n - statistics.nValid;
            statsRows.push({
                [resolved.groupField]: groupLabel,
                ...statistics,
            });
            groupDomain.push(groupLabel);
            groupSummaries.push({
                title: groupLabel,
                sampleCount: statistics.n,
                nonMissingCount: statistics.nValid,
                missingCount: statistics.n - statistics.nValid,
                min: statistics.min,
                q1: statistics.q1,
                median: statistics.median,
                q3: statistics.q3,
                max: statistics.max,
                iqr: statistics.iqr,
                outlierCount: outliers.length,
            });
        } else {
            missingCount += sampleRows.length;
        }

        for (const outlier of outliers) {
            outlierRows.push({
                [resolved.groupField]: groupLabel,
                [resolved.sampleField]: outlier[resolved.sampleField],
                [resolved.valueField]: outlier[resolved.valueField],
            });
        }
    }

    return {
        statsRows,
        outlierRows,
        groupDomain,
        sampleCount,
        nonMissingCount,
        missingCount,
        groupSummaries,
    };
}
