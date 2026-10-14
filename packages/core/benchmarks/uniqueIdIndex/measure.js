/** @param {number[]} values */
export function summary(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const deviations = sorted
        .map((value) => Math.abs(value - median))
        .sort((a, b) => a - b);
    return {
        median,
        min: sorted[0],
        max: sorted.at(-1),
        mad: deviations[Math.floor(deviations.length / 2)],
    };
}

/**
 * Batched calls return an observable checksum; adaptive batch repetition keeps
 * fast hash/block lookups above timer resolution without changing query mix.
 * @param {(id: number) => number} lookup @param {Float64Array} ids
 * @param {number} [targetMs]
 */
export function timeLookup(lookup, ids, targetMs = 8) {
    let checksum = 0;
    let batches = 0;
    const start = performance.now();
    let elapsed;
    do {
        for (let i = 0; i < ids.length; i++) checksum += lookup(ids[i]);
        batches++;
        elapsed = performance.now() - start;
    } while (elapsed < targetMs);
    return {
        ns: (elapsed * 1e6) / (batches * ids.length),
        calls: batches * ids.length,
        checksum,
    };
}
