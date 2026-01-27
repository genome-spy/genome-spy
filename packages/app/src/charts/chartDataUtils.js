import templateResultToString from "../utils/templateResultToString.js";

/**
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @returns {Pick<import("../sampleView/types.js").AttributeValuesScope, "interval" | "aggregation">}
 */
export function getAttributeScope(attributeInfo) {
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
 * @param {import("../sampleView/state/sampleState.js").Group[]} path
 * @param {string} separator
 * @returns {string}
 */
export function getGroupLabel(path, separator) {
    const leaf = path[path.length - 1];
    const labelParts =
        path.length > 1
            ? path.slice(1).map((group) => group.title || group.name)
            : [leaf.title || leaf.name];
    return labelParts.join(separator);
}

/**
 * @param {import("../sampleView/state/sampleState.js").Group[]} path
 * @returns {string[]}
 */
export function getGroupSamples(path) {
    const leaf = path[path.length - 1];
    if (!("samples" in leaf)) {
        throw new Error("Expected a sample group leaf node.");
    }

    return leaf.samples;
}

/**
 * @param {string} field
 * @returns {string}
 */
export function escapeFieldName(field) {
    return field
        .replaceAll("\\", "\\\\")
        .replaceAll(".", "\\.")
        .replaceAll("[", "\\[")
        .replaceAll("]", "\\]");
}

/**
 * @param {import("../sampleView/compositeAttributeInfoSource.js").default} attributeInfoSource
 * @param {import("../sampleView/state/sampleState.js").GroupMetadata[]} groupMetadata
 * @param {string} [separator]
 * @returns {string | null}
 */
export function resolveGroupTitle(
    attributeInfoSource,
    groupMetadata,
    separator = " / "
) {
    if (groupMetadata.length === 0) {
        return null;
    }

    const labels = groupMetadata.map((entry) => {
        const info = attributeInfoSource.getAttributeInfo(entry.attribute);
        return templateResultToString(info.title);
    });

    return labels.join(separator);
}
