import clamp from "./clamp";

const MAX_INTEGER = 2 ** 31 - 1;

/**
 * @callback Lookup
 * @param {number} start
 * @param {number} end
 * @returns {[number, number]}
 */

/**
 * A binned index for (overlapping) ranges that are sorted by their start position.
 * Allows for indexing vertices of mark instances.
 *
 * @param {number} size Number of bins
 * @param {[number, number]} domain
 */
export default function createBinningRangeIndexer(size, domain) {
    const startIndices = new Int32Array(size);
    startIndices.fill(MAX_INTEGER);

    const endIndices = new Int32Array(size);

    const start = domain[0];
    const domainLength = domain[1] - domain[0];
    const divisor = domainLength / size;

    /** @param {number} pos */
    const getBin = pos =>
        clamp(Math.floor((pos - start) / divisor), 0, size - 1);

    /**
     *
     * @param {number} start
     * @param {number} end
     * @param {number} startIndex
     * @param {number} endIndex
     */
    const indexer = (start, end, startIndex, endIndex) => {
        const startBin = getBin(start);
        const endBin = getBin(end);

        // TODO: This loop could probably be done as a more efficient post processing
        // step.
        for (let bin = startBin; bin <= endBin; bin++) {
            if (startIndices[bin] > startIndex) {
                startIndices[bin] = startIndex;
            }

            if (endIndices[bin] < endIndex) {
                endIndices[bin] = endIndex;
            }
        }
    };

    /**
     * @type {Lookup}
     */
    const lookup = (start, end) => {
        return [startIndices[getBin(start)], endIndices[getBin(end)]];
    };

    const getIndex = () => {
        for (let i = 1; i < endIndices.length; i++) {
            if (endIndices[i] < endIndices[i - 1]) {
                endIndices[i] = endIndices[i - 1];
            }
        }
        for (let i = endIndices.length - 1; i > 0; i--) {
            if (endIndices[i - 1] > endIndices[i]) {
                endIndices[i - 1] = endIndices[i];
            }
        }

        return lookup;
    };

    indexer.getIndex = getIndex;

    return indexer;
}
