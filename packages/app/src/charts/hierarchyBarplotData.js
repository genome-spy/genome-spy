import { getFlattenedGroupHierarchy } from "../sampleView/state/sampleSlice.js";
import { extractAttributeValues } from "../sampleView/attributeValues.js";
import {
    getAttributeScope,
    getGroupLabel,
    getGroupSamples,
} from "./chartDataUtils.js";

const DEFAULT_OPTIONS = Object.freeze({
    categoryField: "category",
    groupField: "group",
    countField: "Count",
    groupLabelSeparator: " / ",
    grouped: undefined,
});

/**
 * @typedef {object} HierarchyBarplotOptions
 * @prop {string} [categoryField]
 * @prop {string} [groupField]
 * @prop {string} [countField]
 * @prop {string} [groupLabelSeparator]
 * @prop {boolean} [grouped]
 */

/**
 * @typedef {HierarchyBarplotOptions & {
 *   categoryField: string,
 *   groupField: string,
 *   countField: string,
 *   groupLabelSeparator: string,
 *   grouped: boolean
 * }} ResolvedHierarchyBarplotOptions
 */

/**
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @param {HierarchyBarplotOptions} [options]
 * @returns {{
 *   rows: Record<string, import("@genome-spy/core/spec/channel.js").Scalar | number>[],
 *   categoryDomain: import("@genome-spy/core/spec/channel.js").Scalar[],
 *   groupDomain: string[],
 *   grouped: boolean
 * }}
 */
export function buildHierarchyBarplotData(
    sampleHierarchy,
    attributeInfo,
    options = {}
) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    if (attributeInfo.type !== "nominal" && attributeInfo.type !== "ordinal") {
        throw new Error("Bar plot requires a categorical attribute.");
    }

    /** @type {ResolvedHierarchyBarplotOptions} */
    const resolved = {
        ...DEFAULT_OPTIONS,
        grouped:
            sampleHierarchy.groupMetadata.length > 0 ||
            "groups" in sampleHierarchy.rootGroup,
        ...options,
    };

    const rows = [];
    const categoryDomain = [];
    const categorySeen = new Set();
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

        const counts = new Map();

        for (const rawValue of values) {
            if (rawValue === null || rawValue === undefined) {
                continue;
            }

            const category = rawValue;
            counts.set(category, (counts.get(category) ?? 0) + 1);

            if (!categorySeen.has(category)) {
                categorySeen.add(category);
                categoryDomain.push(category);
            }
        }

        if (counts.size === 0) {
            continue;
        }

        if (resolved.grouped) {
            groupDomain.push(groupLabel);
        }

        for (const [category, count] of counts) {
            rows.push({
                [resolved.categoryField]: category,
                [resolved.countField]: count,
                ...(resolved.grouped
                    ? { [resolved.groupField]: groupLabel }
                    : {}),
            });
        }
    }

    return {
        rows,
        categoryDomain,
        groupDomain,
        grouped: resolved.grouped,
    };
}
