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
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier | { interval: import("./types.js").Interval } | { intervalSource: import("./sampleViewTypes.js").SelectionIntervalSource }} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalLiteralSpecifier | { interval: import("./types.js").Interval }}
 */
export function hasLiteralInterval(specifier) {
    return "interval" in specifier;
}

/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier | { interval: import("./types.js").Interval } | { intervalSource: import("./sampleViewTypes.js").SelectionIntervalSource }} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSourceSpecifier | { intervalSource: import("./sampleViewTypes.js").SelectionIntervalSource }}
 */
export function hasIntervalSource(specifier) {
    return "intervalSource" in specifier;
}
