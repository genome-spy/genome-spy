let nextLoopId = 0;

/**
 * Iterate a dense batch with an independent callback call site for large data.
 * This lets the JIT inline a batch's accessors instead of sharing polymorphic
 * feedback between unrelated fields/scales. WebGL's ArrayBuilder similarly
 * specializes large-data loops; small batches avoid compilation overhead.
 *
 * @template T
 * @param {T[]} data
 * @param {(datum: T, index: number) => void} visit
 */
export default function forEachInBatch(data, visit) {
    if (data.length > 10000) {
        Function(
            "data",
            "visit",
            `
            // batch loop ${nextLoopId++}
            for (let i = 0; i < data.length; i++) {
                visit(data[i], i);
            }
        `
        )(data, visit);
    } else {
        for (let i = 0; i < data.length; i++) {
            visit(data[i], i);
        }
    }
}
