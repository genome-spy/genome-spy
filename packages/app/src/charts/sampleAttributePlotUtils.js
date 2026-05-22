/**
 * Resolves the color scale used for grouped sample scatterplots.
 *
 * The grouped color palette is only useful when there is exactly one
 * categorical group attribute and that attribute already defines a non-
 * quantitative scale with a concrete domain and string range.
 *
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @returns {{ domain: string[], range: string[] } | undefined}
 */
export function getGroupColorScale(sampleView) {
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
    if (
        !scale ||
        typeof scale.domain !== "function" ||
        typeof scale.range !== "function"
    ) {
        return;
    }

    const domain = scale.domain();
    const range = scale.range();
    if (
        Array.isArray(domain) &&
        Array.isArray(range) &&
        range.every((value) => typeof value === "string")
    ) {
        return { domain: domain.map(String), range };
    }
}
