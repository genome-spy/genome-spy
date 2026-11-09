/**
 * Sorts nonnegative safe integer keys using 11-bit digits.
 * May modify the input; returns a sorted ordinary array.
 *
 * @param {number[]} arr
 * @returns {number[]}
 */
export default function radixSort(arr) {
    const n = arr.length;
    let max = 0;
    let sorted = true;

    for (let i = 0; i < n; i++) {
        const value = arr[i];
        if (value > max) {
            max = value;
        }
        if (i && value < arr[i - 1]) {
            sorted = false;
        }
    }

    if (sorted) {
        return arr;
    }

    /** @type {number[] | Float64Array} */
    let values = arr;

    /** @type {number[] | Float64Array} */
    let buffer = new Float64Array(n);

    const counts = new Uint32Array(2048);

    for (let shift = 0; shift < 53 && 2 ** shift <= max; shift += 11) {
        const divisor = 2 ** shift;
        counts.fill(0);

        for (let i = 0; i < n; i++) {
            counts[getDigit(values[i], shift, divisor)]++;
        }

        let total = 0;
        for (let i = 0; i < counts.length; i++) {
            const count = counts[i];
            counts[i] = total;
            total += count;
        }

        for (let i = 0; i < n; i++) {
            const value = values[i];
            buffer[counts[getDigit(value, shift, divisor)]++] = value;
        }

        [values, buffer] = [buffer, values];
    }

    // Reuse the input array when the last pass finishes in typed scratch.
    if (values !== arr) {
        for (let i = 0; i < n; i++) {
            arr[i] = values[i];
        }
    }

    return arr;
}

/**
 * The 11-bit digit starting at bit 22 crosses the 32-bit bitwise boundary.
 * Division by a power of two preserves every safe-integer digit.
 *
 * @param {number} value
 * @param {number} shift
 * @param {number} divisor
 */
function getDigit(value, shift, divisor) {
    return shift < 22
        ? (value >>> shift) & 0x7ff
        : Math.floor(value / divisor) & 0x7ff;
}

/**
 * Returns a stable permutation of positions without modifying the input.
 * Uses 11-bit digits and four-byte positions; keys retain safe-integer precision.
 *
 * @param {number[]} arr Nonnegative safe integer keys
 * @returns {Uint32Array}
 */
export function radixSortIntoLookupArray(arr) {
    const n = arr.length;
    let indexes = new Uint32Array(n);
    let max = 0;
    let sorted = true;

    for (let i = 0; i < n; i++) {
        const value = arr[i];
        indexes[i] = i;
        max = Math.max(max, value);
        if (i && value < arr[i - 1]) {
            sorted = false;
        }
    }

    if (sorted) {
        return indexes;
    }

    // If the keys are contiguous, the largest key fixes their first position.
    // Check the ends before initializing the dense path for obviously sparse IDs.
    const min = max - (n - 1);
    if (
        min >= 0 &&
        Number.isSafeInteger(max) &&
        arr[0] >= min &&
        arr[n - 1] >= min
    ) {
        const empty = 0xffffffff;
        indexes.fill(empty);
        let i = 0;
        for (; i < n; i++) {
            const offset = arr[i] - min;
            if (!Number.isInteger(offset) || indexes[offset] !== empty) {
                break;
            }
            indexes[offset] = i;
        }
        if (i === n) {
            return indexes;
        }
        // Duplicate keys or holes need the stable radix path.
        for (let j = 0; j < n; j++) {
            indexes[j] = j;
        }
    }

    let buffer = new Uint32Array(n);
    const counts = new Uint32Array(2048);

    for (let shift = 0; shift < 53 && 2 ** shift <= max; shift += 11) {
        const divisor = 2 ** shift;
        counts.fill(0);

        // Every permutation contains the same keys. Count in input order.
        for (let i = 0; i < n; i++) {
            counts[getDigit(arr[i], shift, divisor)]++;
        }

        let total = 0;
        for (let i = 0; i < counts.length; i++) {
            const count = counts[i];
            counts[i] = total;
            total += count;
        }

        // Forward scatter keeps equal keys in their current physical order.
        for (let i = 0; i < n; i++) {
            const index = indexes[i];
            buffer[counts[getDigit(arr[index], shift, divisor)]++] = index;
        }

        [indexes, buffer] = [buffer, indexes];
    }

    return indexes;
}
