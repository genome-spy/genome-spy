/**
 * @param {import("./sampleViewTypes.js").ViewAttributeSpecifier} specifier
 * @returns {specifier is import("./sampleViewTypes.js").IntervalSpecifier}
 */
export function isIntervalSpecifier(specifier) {
    return (
        "aggregation" in specifier &&
        "interval" in specifier &&
        (isLiteralInterval(specifier.interval) ||
            isIntervalSource(specifier.interval))
    );
}

/**
 * @param {import("./sampleViewTypes.js").IntervalReference} interval
 * @returns {interval is import("./types.js").Interval}
 */
export function isLiteralInterval(interval) {
    return Array.isArray(interval);
}

/**
 * @param {import("./sampleViewTypes.js").IntervalReference} interval
 * @returns {interval is import("./sampleViewTypes.js").SelectionIntervalSource}
 */
export function isIntervalSource(interval) {
    return (
        typeof interval === "object" &&
        interval !== null &&
        "type" in interval &&
        interval.type === "selection" &&
        "selector" in interval
    );
}
