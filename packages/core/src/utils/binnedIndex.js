import clamp from "./clamp";

const MAX_INTEGER = 2 ** 31 - 1;
const MIN_INTEGER = -(2 ** 31);

/**
 * @callback Lookup
 * @param {number} start
 * @param {number} end
 * @param {[number, number]} [arr] Store the result into this array (and return it)
 * @returns {[number, number]}
 */

/**
 * A binned index for (overlapping) ranges that are sorted by their start position.
 *
 * @param {number} size Number of bins
 * @param {[number, number]} domain
 * @param {(datum: T) => number} accessor
 * @param {(datum: T) => number} [accessor2]
 * @template T
 */
export function createBinningRangeIndexer(
    size,
    domain,
    accessor,
    accessor2 = accessor
) {
    const startIndices = new Int32Array(size);
    startIndices.fill(MAX_INTEGER);

    let lastIndex = MIN_INTEGER;
    let unordered = false;

    const endIndices = new Int32Array(size);

    const start = domain[0];
    const domainLength = domain[1] - domain[0];
    const divisor = domainLength / size;

    /** @param {number} pos */
    const getBin = (pos) =>
        clamp(Math.floor((pos - start) / divisor), 0, size - 1);

    /**
     *
     * @param {T} datum
     * @param {number} startIndex
     * @param {number} endIndex
     */
    function binningIndexer(datum, startIndex, endIndex) {
        if (startIndex > lastIndex) {
            lastIndex = startIndex;
        } else if (!unordered) {
            unordered = true;
            // TODO: Contextual info like view path
            console.debug(
                "Items are not ordered properly. Disabling binned index."
            );
        }

        const value = accessor(datum);
        const bin = getBin(value);

        if (startIndices[bin] > startIndex) {
            startIndices[bin] = startIndex;
        }

        if (endIndices[bin] < endIndex) {
            endIndices[bin] = endIndex;
        }
    }

    /**
     *
     * @param {T} datum
     * @param {number} startIndex
     * @param {number} endIndex
     */
    function binningRangeIndexer(datum, startIndex, endIndex) {
        if (startIndex > lastIndex) {
            lastIndex = startIndex;
        } else if (!unordered) {
            unordered = true;
            // TODO: Contextual info like view path
            console.debug(
                "Items are not ordered properly. Disabling binned index."
            );
        }

        const start = accessor(datum);
        const end = accessor2(datum);
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
    }

    /**
     * @type {Lookup}
     */
    const lookup = (start, end, arr = [0, 0]) => {
        arr[0] = startIndices[getBin(start)];
        arr[1] = Math.max(endIndices[getBin(end)], arr[0]);
        return arr;
    };

    const getIndex = () => {
        for (let i = 1; i < endIndices.length; i++) {
            if (endIndices[i] < endIndices[i - 1]) {
                endIndices[i] = endIndices[i - 1];
            }
        }

        let tail = true;

        for (let i = startIndices.length - 1; i > 0; i--) {
            if (tail && startIndices[i] == MAX_INTEGER) {
                startIndices[i] = endIndices[i];
                tail = false;
            } else if (startIndices[i - 1] > startIndices[i]) {
                startIndices[i - 1] = startIndices[i];
            }
        }

        return lookup;
    };

    binningIndexer.getIndex = getIndex;
    binningRangeIndexer.getIndex = getIndex;

    if (unordered) {
        return undefined;
    } else {
        return accessor == accessor2 ? binningIndexer : binningRangeIndexer;
    }
}
