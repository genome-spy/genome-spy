import clamp from "../utils/clamp.js";

const MAX_INTEGER = 2 ** 31 - 1;
const MIN_INTEGER = -(2 ** 31);

/**
 * @callback VertexReader
 * @param {number} vertexIndex
 * @returns {number}
 */

/**
 * A binned index for vertex ranges that are already emitted into typed arrays.
 * The readers operate on vertices, not source datums.
 *
 * The scan is run-based: consecutive vertices with the same effective x
 * interval are collapsed into one range before binning.
 *
 * @param {number} size Number of bins
 * @param {[number, number]} domain Domain of positions
 * @param {VertexReader} readStart Reader for the start x value at a vertex
 * @param {VertexReader} [readEnd=readStart] Reader for the end x value at a vertex
 * @param {number} [startVertexIndex=0] First vertex index in the scanned range
 * @param {number} [endVertexIndex=startVertexIndex] One past the last vertex index
 * @returns {import("../utils/binnedIndex.js").Lookup | undefined}
 */
export function createVertexRangeIndexer(
    size,
    domain,
    readStart,
    readEnd = readStart,
    startVertexIndex = 0,
    endVertexIndex = startVertexIndex
) {
    if (endVertexIndex <= startVertexIndex) {
        return undefined;
    }

    if (domain[1] <= domain[0]) {
        return undefined;
    }

    const startIndices = new Array(size);
    startIndices.fill(MAX_INTEGER);

    const endIndices = new Array(size);
    endIndices.fill(0);

    const start = domain[0];
    const domainLength = domain[1] - domain[0];
    const divisor = domainLength / size;

    /**
     * @param {number} pos
     * @param {boolean} end
     */
    const getBin = (pos, end) => {
        const unfloored = (pos - start) / divisor;
        const floored = Math.floor(unfloored);

        // Special handling for the end coordinate because we are using half-open ranges.
        return clamp(
            end && floored == unfloored ? floored - 1 : floored,
            0,
            size - 1
        );
    };

    let lastIndex = MIN_INTEGER;
    let lastStart = -Infinity;
    let unordered = false;

    /**
     * @type {import("../utils/binnedIndex.js").Lookup}
     */
    const lookup = (queryStart, queryEnd, arr = [0, 0]) => {
        const startBin = getBin(queryStart, false);
        const endBin = getBin(queryEnd, true);
        const startIndex = startIndices[startBin];
        const endIndex = Math.max(endIndices[endBin], startIndex);

        arr[0] = startIndex;
        arr[1] = endIndex;
        return arr;
    };

    for (let i = startVertexIndex; i < endVertexIndex; ) {
        const runStart = i;
        const runX = readStart(i);
        const runX2 = readEnd(i);

        i += 1;
        while (
            i < endVertexIndex &&
            readStart(i) === runX &&
            readEnd(i) === runX2
        ) {
            i += 1;
        }

        if (runStart > lastIndex) {
            lastIndex = runStart;
        } else {
            unordered = true;
            break;
        }

        if (runX < lastStart || runX2 < runX) {
            unordered = true;
            break;
        }
        lastStart = runX;

        const startBin = getBin(runX, false);
        const endBin = getBin(runX2, true);

        for (let bin = startBin; bin <= endBin; bin++) {
            if (startIndices[bin] > runStart) {
                startIndices[bin] = runStart;
            }

            if (endIndices[bin] < i) {
                endIndices[bin] = i;
            }
        }
    }

    if (unordered) {
        return undefined;
    }

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
}
