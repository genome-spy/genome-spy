import Heapify from "heapify";

/**
 * Returns an iterator that merges multiple sorted blocks that are located
 * in a single array.
 *
 * @param {T[]} array
 * @param {[number, number][]} extents An array of [lo, hi[ extents
 * @param {function(T):number} [accessor]
 * @template T
 */
export default function* kWayMerge(array, extents, accessor = x => +x) {
    // https://www.wikiwand.com/en/K-way_merge_algorithm

    // This could be optimized by implementing a tournament tree or
    // by adding replaceTop to the Heap.
    // https://docs.python.org/2/library/heapq.html#heapq.heapreplace

    const heap = new Heapify(extents.length);

    /** @type {number[]} */
    const pointers = [];

    /** @type {number[]} */
    const stops = [];

    const validate = false;

    for (const [i, extent] of extents.entries()) {
        const [lo, hi] = extent;
        pointers[i] = lo;
        stops[i] = hi;
        if (hi - lo) {
            heap.push(i, accessor(array[lo]));
        }
    }

    while (heap.size) {
        const i = heap.pop();
        let pointer = pointers[i];
        const element = array[pointer++];

        yield element;

        if (pointer < stops[i]) {
            const newValue = accessor(array[pointer]);
            if (validate && newValue < accessor(element)) {
                throw new Error(
                    "The input arrays to be merged are not in sorted order!"
                );
            }
            heap.push(i, newValue);
            pointers[i] = pointer;
        }
    }
}
