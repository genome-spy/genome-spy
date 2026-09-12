/**
 * Expand a visible interval to the fixed-size windows that cover it.
 *
 * This mirrors the window coverage check used by GenomeSpy's lazy sources:
 * requests are aligned to window boundaries and clipped to the genome extent.
 *
 * @param {number[]} interval
 * @param {number} windowSize
 * @param {number} totalSize
 * @returns {[number, number]}
 */
export function quantizeInterval(interval, windowSize, totalSize) {
    return [
        Math.max(Math.floor(interval[0] / windowSize) * windowSize, 0),
        Math.min(Math.ceil(interval[1] / windowSize) * windowSize, totalSize),
    ];
}

/**
 * Return whether the requested interval reaches beyond the currently loaded
 * coverage. Panning inside the loaded interval does not need another request.
 *
 * @param {number[]} interval
 * @param {number[] | undefined} loadedInterval
 * @returns {boolean}
 */
export function hasWindowCoverageChanged(interval, loadedInterval) {
    return (
        loadedInterval === undefined ||
        interval[0] < loadedInterval[0] ||
        interval[1] > loadedInterval[1]
    );
}
