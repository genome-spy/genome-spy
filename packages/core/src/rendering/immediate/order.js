/**
 * Partitions one candidate range for an active conditional order predicate.
 * The returned arrays retain the input order within each partition.
 *
 * @param {object[]} data
 * @param {number} start
 * @param {number} end
 * @param {(datum: object) => boolean} predicate
 * @param {Array<"matching" | "nonmatching">} passes
 * @returns {object[][]}
 */
export function partitionOrderData(data, start, end, predicate, passes) {
    /** @type {object[]} */
    const matching = [];
    /** @type {object[]} */
    const nonmatching = [];
    for (let index = start; index < end; index++) {
        const datum = data[index];
        (predicate(datum) ? matching : nonmatching).push(datum);
    }
    return passes.map((pass) => (pass === "matching" ? matching : nonmatching));
}
