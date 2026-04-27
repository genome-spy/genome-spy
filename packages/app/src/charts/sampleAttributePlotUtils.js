/**
 * Resolves the color range used for grouped sample scatterplots.
 *
 * The grouped color palette is only useful when there is exactly one
 * categorical group attribute and that attribute already defines a non-
 * quantitative scale.
 *
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @returns {string[] | undefined}
 */
export function getGroupColorRange(sampleView) {
    if (sampleView.sampleHierarchy.groupMetadata.length !== 1) {
        return;
    }

    const attribute = sampleView.sampleHierarchy.groupMetadata[0].attribute;
    if (attribute.type !== "SAMPLE_ATTRIBUTE") {
        return;
    }

    const attributeInfo =
        sampleView.compositeAttributeInfoSource.getAttributeInfo(attribute);
    if (attributeInfo.type === "quantitative") {
        return;
    }

    const scale = attributeInfo.scale;
    if (!scale || typeof scale.range !== "function") {
        return;
    }

    return scale.range();
}
