/**
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {string[]} sampleIds
 * @param {import("./state/sampleSlice.js").SampleHierarchy} sampleHierarchy
 * @param {Pick<import("./types.js").AttributeValuesScope, "interval" | "aggregation">} [scope]
 * @returns {any[]}
 */
export function extractAttributeValues(
    attributeInfo,
    sampleIds,
    sampleHierarchy,
    scope = {}
) {
    if (attributeInfo.valuesProvider) {
        return attributeInfo.valuesProvider({
            sampleIds,
            sampleHierarchy,
            interval: scope.interval,
            aggregation: scope.aggregation,
        });
    }

    const a = attributeInfo.accessor;
    return sampleIds.map((sampleId) => a(sampleId, sampleHierarchy));
}
