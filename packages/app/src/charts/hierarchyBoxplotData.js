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
 *   groupDomain: import("@genome-spy/core/spec/channel.js").Scalar[]
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
    const attributeScope = getAttributeScope(attributeInfo);

    for (const path of getFlattenedGroupHierarchy(sampleHierarchy)) {
        const groupLabel = getGroupLabel(path, resolved.groupLabelSeparator);
        const sampleIds = getGroupSamples(path);
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
            statsRows.push({
                [resolved.groupField]: groupLabel,
                ...statistics,
            });
            groupDomain.push(groupLabel);
        }

        for (const outlier of outliers) {
            outlierRows.push({
                [resolved.groupField]: groupLabel,
                [resolved.sampleField]: outlier[resolved.sampleField],
                [resolved.valueField]: outlier[resolved.valueField],
            });
        }
    }

    return { statsRows, outlierRows, groupDomain };
}
