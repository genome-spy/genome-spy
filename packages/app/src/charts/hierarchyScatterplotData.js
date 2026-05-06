import { getFlattenedGroupHierarchy } from "../sampleView/state/sampleSlice.js";
import { extractAttributeValues } from "../sampleView/attributeValues.js";
import {
    getAttributeScope,
    getGroupLabel,
    getGroupSamples,
} from "./chartDataUtils.js";

const DEFAULT_OPTIONS = Object.freeze({
    groupField: "group",
    xField: "x",
    yField: "y",
    sampleField: "sample",
    groupLabelSeparator: " / ",
});

/**
 * @typedef {object} HierarchyScatterplotOptions
 * @prop {string} [groupField]
 * @prop {string} [xField]
 * @prop {string} [yField]
 * @prop {string} [sampleField]
 * @prop {string} [groupLabelSeparator]
 */

/**
 * @typedef {HierarchyScatterplotOptions & {
 *   groupField: string,
 *   xField: string,
 *   yField: string,
 *   sampleField: string,
 *   groupLabelSeparator: string
 * }} ResolvedHierarchyScatterplotOptions
 */

/**
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView/types.js").AttributeInfo} xAttributeInfo
 * @param {import("../sampleView/types.js").AttributeInfo} yAttributeInfo
 * @param {HierarchyScatterplotOptions} [options]
 * @returns {{
 *   rows: Record<string, import("@genome-spy/core/spec/channel.js").Scalar | number>[],
 *   groupDomain: string[],
 *   sampleCount: number,
 *   missingPairCount: number,
 *   groupSummaries: Array<{ title: string, plottedPointCount: number }>
 * }}
 */
export function buildHierarchyScatterplotData(
    sampleHierarchy,
    xAttributeInfo,
    yAttributeInfo,
    options = {}
) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    if (
        xAttributeInfo.type !== "quantitative" ||
        yAttributeInfo.type !== "quantitative"
    ) {
        throw new Error("Scatterplot requires quantitative attributes.");
    }

    /** @type {ResolvedHierarchyScatterplotOptions} */
    const resolved = { ...DEFAULT_OPTIONS, ...options };

    const rows = [];
    /** @type {string[]} */
    const groupDomain = [];
    const groupSummaries = [];
    const xScope = getAttributeScope(xAttributeInfo);
    const yScope = getAttributeScope(yAttributeInfo);
    let sampleCount = 0;
    let missingPairCount = 0;

    for (const path of getFlattenedGroupHierarchy(sampleHierarchy)) {
        const groupLabel = getGroupLabel(path, resolved.groupLabelSeparator);
        const sampleIds = getGroupSamples(path);
        sampleCount += sampleIds.length;
        const xValues = extractAttributeValues(
            xAttributeInfo,
            sampleIds,
            sampleHierarchy,
            xScope
        );
        const yValues = extractAttributeValues(
            yAttributeInfo,
            sampleIds,
            sampleHierarchy,
            yScope
        );

        if (xValues.length !== sampleIds.length) {
            throw new Error(
                "X attribute values length does not match sample ids."
            );
        }
        if (yValues.length !== sampleIds.length) {
            throw new Error(
                "Y attribute values length does not match sample ids."
            );
        }

        let groupHasRows = false;
        let groupPlottedPointCount = 0;

        for (let i = 0; i < sampleIds.length; i += 1) {
            const xRaw = xValues[i];
            const yRaw = yValues[i];
            if (xRaw === null || xRaw === undefined) {
                missingPairCount++;
                continue;
            }
            if (yRaw === null || yRaw === undefined) {
                missingPairCount++;
                continue;
            }
            const x = typeof xRaw === "number" ? xRaw : Number(xRaw);
            const y = typeof yRaw === "number" ? yRaw : Number(yRaw);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                missingPairCount++;
                continue;
            }

            rows.push({
                [resolved.sampleField]: sampleIds[i],
                [resolved.xField]: x,
                [resolved.yField]: y,
                [resolved.groupField]: groupLabel,
            });
            groupHasRows = true;
            groupPlottedPointCount++;
        }

        if (groupHasRows) {
            groupDomain.push(groupLabel);
            groupSummaries.push({
                title: groupLabel,
                plottedPointCount: groupPlottedPointCount,
            });
        }
    }

    return { rows, groupDomain, sampleCount, missingPairCount, groupSummaries };
}
