import FlatQueue from "flatqueue";

/**
 * Finds the top k elements in a slice of the data array, using a priority accessor.
 *
 * @param {T[]} data
 * @param {number} k
 * @param {(datum: T) => number} priorityAccessor
 * @param {number} [start] Default: 0
 * @param {number} [end] Exclusive. Default: data.length
 * @template T
 * @returns {T[]}
 */
export function topK(
    data,
    k,
    priorityAccessor = (x) => +x,
    start = 0,
    end = data.length
) {
    /** @type {FlatQueue<number>} */
    const queue = new FlatQueue();
    const sliceLength = end - start;

    let i;
    for (i = 0; i < k && i < sliceLength; i++) {
        queue.push(i, priorityAccessor(data[start + i]));
    }

    for (; i < sliceLength; i++) {
        const p = priorityAccessor(data[start + i]);
        if (p >= queue.peekValue()) {
            queue.push(i, p);
            queue.pop();
        }
    }

    const result = [];
    let index;
    while ((index = queue.pop()) !== undefined) {
        result.push(data[start + index]);
    }

    return result.reverse();
}
