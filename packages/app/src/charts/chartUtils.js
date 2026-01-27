import templateResultToString from "../utils/templateResultToString.js";

/**
 * @param {import("../sampleView/compositeAttributeInfoSource.js").default} attributeInfoSource
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @returns {{ label: string, title: string }}
 */
export function resolveAttributeText(attributeInfoSource, attributeInfo) {
    const resolvedInfo = attributeInfoSource.getAttributeInfo(
        attributeInfo.attribute
    );

    const labelSource = resolvedInfo.emphasizedName ?? resolvedInfo.name;
    const titleSource = resolvedInfo.title ?? resolvedInfo.name;

    return {
        label: templateResultToString(labelSource),
        title: templateResultToString(titleSource),
    };
}
