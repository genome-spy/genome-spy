/**
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {string[]} sampleIds
 * @param {import("./state/sampleSlice.js").SampleHierarchy} sampleHierarchy
 * @param {Pick<import("./types.js").AttributeValuesScope, "interval" | "aggregation">} [scope]
 * @returns {any[]}
 */
/**
 * Provides a default values provider that uses the attribute accessor.
 *
 * @param {import("./types.js").AttributeInfo["accessor"]} accessor
 * @returns {(scope: import("./types.js").AttributeValuesScope) => any[]}
 */
export function createDefaultValuesProvider(accessor) {
    return (scope) =>
        scope.sampleIds.map((sampleId) =>
            accessor(sampleId, scope.sampleHierarchy)
        );
}

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
    return attributeInfo.valuesProvider({
        sampleIds,
        sampleHierarchy,
        interval: scope.interval,
        aggregation: scope.aggregation,
    });
}
