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
        counts.fill(0);

        for (let i = 0; i < n; i++) {
            counts[getDigit(values[i], shift)]++;
        }

        let total = 0;
        for (let i = 0; i < counts.length; i++) {
            const count = counts[i];
            counts[i] = total;
            total += count;
        }

        for (let i = 0; i < n; i++) {
            const value = values[i];
            buffer[counts[getDigit(value, shift)]++] = value;
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
 */
function getDigit(value, shift) {
    return shift < 22
        ? (value >>> shift) & 0x7ff
        : Math.floor(value / 2 ** shift) & 0x7ff;
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
        indexes[i] = i;
        max = Math.max(max, arr[i]);
        if (i && arr[i] < arr[i - 1]) {
            sorted = false;
        }
    }

    if (sorted) {
        return indexes;
    }

    let buffer = new Uint32Array(n);
    const counts = new Uint32Array(2048);

    for (let shift = 0; shift < 53 && 2 ** shift <= max; shift += 11) {
        counts.fill(0);

        for (let i = 0; i < n; i++) {
            counts[getDigit(arr[indexes[i]], shift)]++;
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
            buffer[counts[getDigit(arr[index], shift)]++] = index;
        }

        [indexes, buffer] = [buffer, indexes];
    }

    return indexes;
}
