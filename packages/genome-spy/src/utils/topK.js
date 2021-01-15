import Heapify from "heapify";

/**
 * Finds the top k
 *
 * Based on ideas at https://lemire.me/blog/2017/06/21/top-speed-for-top-k-queries/
 *
 * @param {any[]} data
 * @param {number} k
 * @param {function(any):number} priorityAccessor
 */
export function topK(data, k, priorityAccessor) {
    const queue = new Heapify(k + 1);

    // +1 because there may be a bug in Heapify, breaks on zeros or something
    // TODO: Investigate
    const offset = 1;

    /** @type {number} */
    let i;

    for (i = 0; i < k && i < data.length; i++) {
        queue.push(i, offset + priorityAccessor(data[i]));
    }

    for (; i < data.length; i++) {
        const p = offset + priorityAccessor(data[i]);
        if (p >= queue.peekPriority()) {
            queue.push(i, p);
            queue.pop();
        }
    }

    const result = [];
    while (queue.size) {
        result.push(data[queue.pop()]);
    }

    return result.reverse();
}

/**
 * Takes an array of priorities and returns the top k indexes from the
 * specified slice
 *
 * @param {number[]} priorities An array of priorities
 * @param {number} k
 * @param {number} [start] Default: 0
 * @param {number} [end] Exclusive. Default: priorities.length
 */
export function topKSlice(priorities, k, start = 0, end = priorities.length) {
    const queue = new Heapify(k + 1);

    // +1 because there may be a bug in Heapify, breaks on zeros or something
    // TODO: Investigate
    const offset = 1;

    const sliceLength = end - start;

    /** @type {number} */
    let i;

    for (i = 0; i < k && i < sliceLength; i++) {
        queue.push(i, offset + priorities[start + i]);
    }

    for (; i < sliceLength; i++) {
        const p = offset + priorities[start + i];
        if (p >= queue.peekPriority()) {
            queue.push(i, p);
            queue.pop();
        }
    }

    const result = [];
    while (queue.size) {
        result.push(start + queue.pop());
    }

    return result.reverse();
}
