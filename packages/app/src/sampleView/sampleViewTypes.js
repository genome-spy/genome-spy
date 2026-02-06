/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSpecifier}
 */
export function isIntervalSpecifier(specifier) {
    return (
        "aggregation" in specifier &&
        (hasLiteralInterval(specifier) || hasIntervalSource(specifier))
    );
}

/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier | { interval: import("./sampleViewTypes.js").IntervalReference }} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSpecifier | { interval: import("./types.js").Interval }}
 */
export function hasLiteralInterval(specifier) {
    return "interval" in specifier && Array.isArray(specifier.interval);
}

/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier | { interval: import("./sampleViewTypes.js").IntervalReference }} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSpecifier | { interval: import("./sampleViewTypes.js").SelectionIntervalSource }}
 */
export function hasIntervalSource(specifier) {
    return "interval" in specifier && !Array.isArray(specifier.interval);
}
