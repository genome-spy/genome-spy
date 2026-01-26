import { field } from "@genome-spy/core/utils/field.js";
import { boxplotStats } from "../utils/statistics/boxplot.js";
import { getFlattenedGroupHierarchy } from "../sampleView/state/sampleSlice.js";

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
 * @param {SampleHierarchy} sampleHierarchy
 * @param {string} attribute
 * @param {HierarchyBoxplotOptions} [options]
 * @returns {{
 *   statsRows: BoxplotStatsRow[],
 *   outlierRows: BoxplotOutlierRow[],
 *   groupDomain: Scalar[]
 * }}
 */
export function buildHierarchyBoxplotData(
    sampleHierarchy,
    attribute,
    options = {}
) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    if (!sampleHierarchy.sampleMetadata.attributeNames.includes(attribute)) {
        throw new Error("Unknown metadata attribute: " + String(attribute));
    }

    /** @type {ResolvedHierarchyBoxplotOptions} */
    const resolved = { ...DEFAULT_OPTIONS, ...options };

    const valueAccessor = field(attribute);

    const statsRows = [];
    const outlierRows = [];
    const groupDomain = [];

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
        groupDomain.push(groupLabel);

        const sampleRows = [];
        for (const sampleId of leaf.samples) {
            const metadatum = sampleHierarchy.sampleMetadata.entities[sampleId];
            if (!metadatum) {
                continue;
            }
            sampleRows.push({
                sampleId,
                value: valueAccessor(metadatum),
            });
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
