import FlatQueue from "flatqueue";

/**
 * Returns an iterator that merges multiple sorted arrays.
 *
 * @param {T[][]} arrays
 * @param {function(T):number} [accessor]
 * @template T
 */
export default function* kWayMerge(arrays, accessor = (x) => +x) {
    // https://www.wikiwand.com/en/K-way_merge_algorithm

    // This could be optimized by implementing a tournament tree or
    // by adding replaceTop to the Heap.
    // https://docs.python.org/2/library/heapq.html#heapq.heapreplace

    const k = arrays.length;

    const heap = new FlatQueue();
    const pointers = new Array(k).fill(0);

    for (const [i, array] of arrays.entries()) {
        if (array.length) {
            heap.push(i, accessor(array[0]));
        }
    }

    let i = 0;
    while ((i = heap.pop()) !== undefined) {
        const array = arrays[i];
        let pointer = pointers[i];
        const element = array[pointer++];

        yield element;

        if (pointer < array.length) {
            const newValue = accessor(array[pointer]);
            heap.push(i, newValue);
            pointers[i] = pointer;
        }
    }
}
