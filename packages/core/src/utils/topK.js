import FlatQueue from "flatqueue";

/**
 * Finds the top k
 *
 * Based on ideas at https://lemire.me/blog/2017/06/21/top-speed-for-top-k-queries/
 *
 * @param {T[]} data
 * @param {number} k
 * @param {(datum: T) => number} priorityAccessor
 * @template T
 */
export function topK(data, k, priorityAccessor) {
    /** @type {FlatQueue<number>} */
    const queue = new FlatQueue();

    let i;
    for (i = 0; i < k && i < data.length; i++) {
        queue.push(i, priorityAccessor(data[i]));
    }

    for (; i < data.length; i++) {
        const p = priorityAccessor(data[i]);
        if (p >= queue.peekValue()) {
            queue.push(i, p);
            queue.pop();
        }
    }

    const result = [];

    let index;
    while ((index = queue.pop()) !== undefined) {
        result.push(data[index]);
    }

    return result.reverse();
}

/**
 * Takes an array of priorities and returns the top k indices from the
 * specified slice
 *
 * @param {number[]} priorities An array of priorities
 * @param {number} k
 * @param {number} [start] Default: 0
 * @param {number} [end] Exclusive. Default: priorities.length
 */
export function topKSlice(priorities, k, start = 0, end = priorities.length) {
    /** @type {FlatQueue<number>} */
    const queue = new FlatQueue();

    const sliceLength = end - start;

    let i;
    for (i = 0; i < k && i < sliceLength; i++) {
        queue.push(i, priorities[start + i]);
    }

    for (; i < sliceLength; i++) {
        const p = priorities[start + i];
        if (p >= queue.peekValue()) {
            queue.push(i, p);
            queue.pop();
        }
    }

    const result = [];

    let index;
    while ((index = queue.pop()) !== undefined) {
        result.push(start + index);
    }

    return result.reverse();
}
