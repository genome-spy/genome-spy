import FlatQueue from "flatqueue";

/**
 * Finds the top k elements in a slice of the data array, using a priority accessor.
 * Equal priorities use the input order as a stable secondary priority.
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
    const sliceLength = end - start;

    if (k <= 0 || sliceLength <= 0) {
        return [];
    }

    /** @type {FlatQueue<number>} */
    const queue = new FlatQueue();

    let i;
    for (i = 0; i < k && i < sliceLength; i++) {
        queue.push(i, priorityAccessor(data[start + i]));
    }

    for (; i < sliceLength; i++) {
        const priority = priorityAccessor(data[start + i]);
        if (priority > queue.peekValue()) {
            queue.push(i, priority);
            queue.pop();
        }
    }

    const threshold = queue.peekValue();
    const indices = [];
    let higherCount = 0;
    let thresholdCount = 0;

    for (i = 0; i < sliceLength; i++) {
        if (priorityAccessor(data[start + i]) > threshold) {
            higherCount++;
        }
    }

    const thresholdLimit = k - higherCount;

    // The queue only determines the cutoff score. Select cutoff ties in input
    // order instead of inheriting FlatQueue's unspecified tie ordering.
    for (i = 0; i < sliceLength; i++) {
        const priority = priorityAccessor(data[start + i]);
        if (priority > threshold) {
            indices.push(i);
        } else if (
            priority === threshold &&
            thresholdCount++ < thresholdLimit
        ) {
            indices.push(i);
        }
    }

    indices.sort((a, b) => {
        const priorityA = priorityAccessor(data[start + a]);
        const priorityB = priorityAccessor(data[start + b]);

        if (priorityA > priorityB) {
            return -1;
        } else if (priorityA < priorityB) {
            return 1;
        } else {
            return a - b;
        }
    });

    return indices.map((index) => data[start + index]);
}
