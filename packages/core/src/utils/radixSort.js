const MAX_INTEGER = 2147483647;
const MAX_INTEGER_DIGIT = getDigits([MAX_INTEGER]);

// TODO: Optimize more! Some ideas: https://travisdowns.github.io/blog/2019/05/22/sorting.html

/**
 * @param {number[]} arr An array of unsigned integers
 */
export default function radixSort(arr) {
    const maxDigits = getDigits(arr);

    let buffer = new Array(arr.length);
    let bufferPtr = buffer;
    const counts = new Array(16);

    for (let digitIndex = 0; digitIndex < maxDigits; digitIndex++) {
        counts.fill(0);

        const shift = digitIndex * 4;
        const pow = Math.pow(16, digitIndex);

        /**
         * @param {*} i number
         */
        // eslint-disable-next-line no-loop-func
        const getDigit = (/** @type {number} */ i) => {
            const value = arr[i];

            // Need hacks for large numbers because JS bitwise operators only work
            // with 32-bit integers.
            // TODO: This could be implemented in WASM for better performance as
            // it would be able to use 64-bit integers.
            if (digitIndex >= MAX_INTEGER_DIGIT) {
                if (value > MAX_INTEGER) {
                    return Math.floor(value / pow) % 16;
                } else {
                    return 0;
                }
            } else {
                return (value >> shift) & 0xf;
            }
        };

        // Count occurrences of each digit
        for (let i = 0, n = arr.length; i < n; i++) {
            counts[getDigit(i)]++;
        }

        // Prefix sum to get starting indexes
        for (let i = 1; i < 16; i++) {
            counts[i] += counts[i - 1];
        }

        // Sort based on current digit
        for (let i = arr.length - 1; i >= 0; i--) {
            bufferPtr[--counts[getDigit(i)]] = arr[i];
        }

        // Swap buffer and arr for next iteration
        [arr, bufferPtr] = [bufferPtr, arr];
    }

    return arr;
}

/**
 * @param {number[]} arr An array of unsigned integers
 */
function getDigits(arr) {
    let max = 0;
    for (let i = 0, n = arr.length; i < n; i++) {
        max = Math.max(max, arr[i]);
    }
    return Math.floor(Math.log2(max) / 4) + 1;
}

/**
 * @param {number[]} arr An array of unsigned integers
 */
export function radixSortIntoLookupArray(arr) {
    const maxDigits = getDigits(arr);
    let indexes = Array.from({ length: arr.length }, (_, i) => i);
    let buffer = new Array(arr.length);
    const counts = new Array(16);

    for (let digitIndex = 0; digitIndex < maxDigits; digitIndex++) {
        counts.fill(0);

        const shift = digitIndex * 4;
        const pow = Math.pow(16, digitIndex);

        /**
         * @param {*} i number
         */
        // eslint-disable-next-line no-loop-func
        const getDigit = (i) => {
            const value = arr[indexes[i]]; // Use index to access array value

            if (digitIndex >= MAX_INTEGER_DIGIT) {
                if (value > MAX_INTEGER) {
                    return Math.floor(value / pow) % 16;
                } else {
                    return 0;
                }
            } else {
                return (value >> shift) & 0xf;
            }
        };

        // Count occurrences of each digit
        for (let i = 0; i < arr.length; i++) {
            counts[getDigit(i)]++;
        }

        // Prefix sum to get starting indexes
        for (let i = 1; i < 16; i++) {
            counts[i] += counts[i - 1];
        }

        // Sort indexes based on current digit
        for (let i = arr.length - 1; i >= 0; i--) {
            buffer[--counts[getDigit(i)]] = indexes[i];
        }

        // Swap buffer and indexes for next iteration
        [indexes, buffer] = [buffer, indexes];
    }

    return indexes; // Return the sorted index array
}
