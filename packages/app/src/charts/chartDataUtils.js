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
