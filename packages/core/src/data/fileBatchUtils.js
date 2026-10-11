/** @typedef {import("./flowNode.js").Datum} Datum */
/** @typedef {import("../types/flowBatch.js").FileBatch} FileBatch */
/** @typedef {{ index: number, batch: FileBatch }} FileBatchStart */
/** @typedef {(datum: Datum) => FileBatch | undefined} FileBatchAccessor */

/**
 * Retains physical shape boundaries when buffering, grouping, or sorting rows.
 * The common single-file case needs no per-row metadata.
 *
 * @param {Iterable<Datum>} data Input order before any reordering.
 * @param {FileBatchStart[]} starts
 * @returns {FileBatchAccessor}
 */
export function createFileBatchAccessor(data, starts) {
    if (starts.length == 0) {
        return () => undefined;
    }
    if (starts.length == 1 && starts[0].index == 0) {
        return () => starts[0].batch;
    }

    // TODO: Store coalesced file spans instead when profiling justifies it.
    // Reordering must still preserve every input shape transition on replay.
    const batches = new WeakMap();
    let index = 0;
    let next = 0;
    /** @type {FileBatch} */
    let batch = { type: "file" };
    for (const datum of data) {
        while (next < starts.length && starts[next].index <= index) {
            batch = starts[next++].batch;
        }
        batches.set(datum, batch);
        index++;
    }
    return (datum) => batches.get(datum);
}

/**
 * Publishes each row under its original physical shape boundary, even if an
 * algorithm has reordered or sampled the rows. Logical facet boundaries are
 * published by the caller before creating this propagator.
 *
 * @param {FileBatchAccessor} getBatch
 * @param {(batch: FileBatch) => void} beginBatch
 * @param {(datum: Datum) => void} propagate
 * @returns {(datum: Datum) => void}
 */
export function createFileBatchPropagator(getBatch, beginBatch, propagate) {
    /** @type {FileBatch | undefined} */
    let previous;
    return (datum) => {
        const batch = getBatch(datum);
        if (batch !== undefined && batch !== previous) {
            beginBatch(batch);
            previous = batch;
        }
        propagate(datum);
    };
}
