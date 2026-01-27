import { boxplotStats } from "../utils/statistics/boxplot.js";
import { getFlattenedGroupHierarchy } from "../sampleView/state/sampleSlice.js";
import { extractAttributeValues } from "../sampleView/attributeValues.js";

const DEFAULT_OPTIONS = Object.freeze({
    groupField: "group",
    valueField: "value",
    groupLabelSeparator: " / ",
    coef: undefined,
    dropNaN: undefined,
});

/**
 * @typedef {import("../sampleView/state/sampleState.js").SampleHierarchy} SampleHierarchy
 */

/**
 * @typedef {import("./boxplotTypes.d.ts").Scalar} Scalar
 */

/**
 * @typedef {import("./boxplotTypes.d.ts").BoxplotStatsRow} BoxplotStatsRow
 */

/**
 * @typedef {import("./boxplotTypes.d.ts").BoxplotOutlierRow} BoxplotOutlierRow
 */

/**
 * @typedef {import("../sampleView/types.js").AttributeInfo} AttributeInfo
 */

/**
 * @typedef {object} HierarchyBoxplotOptions
 * @prop {string} [groupField]
 * @prop {string} [valueField]
 * @prop {string} [groupLabelSeparator]
 * @prop {number} [coef]
 * @prop {boolean} [dropNaN]
 */

/**
 * @typedef {HierarchyBoxplotOptions & {
 *   groupField: string,
 *   valueField: string,
 *   groupLabelSeparator: string
 * }} ResolvedHierarchyBoxplotOptions
 */

/**
 * @param {AttributeInfo} attributeInfo
 * @returns {Pick<import("../sampleView/types.js").AttributeValuesScope, "interval" | "aggregation">}
 */
function getAttributeScope(attributeInfo) {
    const specifier = attributeInfo.attribute.specifier;
    if (!specifier || typeof specifier !== "object") {
        return {};
    }

    if ("interval" in specifier) {
        const intervalSpecifier =
            /** @type {import("../sampleView/sampleViewTypes.d.ts").IntervalSpecifier} */ (
                specifier
            );
        return {
            interval: intervalSpecifier.interval,
            aggregation: intervalSpecifier.aggregation,
        };
    }

    return {};
}

/**
 * @param {SampleHierarchy} sampleHierarchy
 * @param {AttributeInfo} attributeInfo
 * @param {HierarchyBoxplotOptions} [options]
 * @returns {{
 *   statsRows: BoxplotStatsRow[],
 *   outlierRows: BoxplotOutlierRow[],
 *   groupDomain: Scalar[]
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
        const leaf = path[path.length - 1];
        if (!("samples" in leaf)) {
            throw new Error("Expected a sample group leaf node.");
        }

        const labelParts =
            path.length > 1
                ? path.slice(1).map((group) => group.title || group.name)
                : [leaf.title || leaf.name];
        const groupLabel = labelParts.join(resolved.groupLabelSeparator);

        const sampleIds = leaf.samples;
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
            sampleId,
            value: values[index],
        }));

        if (sampleRows.length === 0) {
            continue;
        }

        const { statistics, outliers } = boxplotStats(
            sampleRows,
            (datum) => datum.value,
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
                sampleId: outlier.sampleId,
                [resolved.groupField]: groupLabel,
                [resolved.valueField]: outlier.value,
            });
        }
    }

    return { statsRows, outlierRows, groupDomain };
}
