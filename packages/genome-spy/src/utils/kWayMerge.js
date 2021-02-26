import Heapify from "heapify";

/**
 * Returns an iterator that merges multiple sorted arrays.
 *
 * @param {T[][]} arrays
 * @param {function(T):number} [accessor]
 * @template T
 */
export default function* kWayMerge(arrays, accessor = x => +x) {
    // https://www.wikiwand.com/en/K-way_merge_algorithm

    // This could be optimized by implementing a tournament tree or
    // by adding replaceTop to the Heap.
    // https://docs.python.org/2/library/heapq.html#heapq.heapreplace

    const k = arrays.length;

    const heap = new Heapify(k);
    const pointers = new Int32Array(k);

    const validate = false;

    for (const [i, array] of arrays.entries()) {
        if (array.length) {
            heap.push(i, accessor(array[0]));
        }
    }

    while (heap.size) {
        const i = heap.pop();

        const array = arrays[i];
        let pointer = pointers[i];
        const element = array[pointer++];

        yield element;

        if (pointer < array.length) {
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
