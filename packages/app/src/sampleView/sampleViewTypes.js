/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSpecifier}
 */
export function isIntervalSpecifier(specifier) {
    return "interval" in specifier && "aggregation" in specifier;
}
