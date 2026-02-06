/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSpecifier}
 */
export function isIntervalSpecifier(specifier) {
    return (
        "aggregation" in specifier &&
        ("interval" in specifier || "intervalSource" in specifier)
    );
}
