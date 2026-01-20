/**
 * Assigns unique values an index number in the order they are encountered.
 *
 * Used to keep categorical GPU encodings stable: once a value gets an index,
 * it must never change for the lifetime of the owning scale.
 *
 * TODO: What about undefined?
 *
 * @template T
 */
export default function createIndexer() {
    let counter = 0;

    /** @type {any} */
    let previousValue;
    let index = 0;

    /** @type {Map<T, number>} */
    const values = new Map();

    /** @param {T} value */
    const indexer = (value) => {
        if (value === previousValue) {
            return index;
        }

        index = values.get(value);
        if (index === undefined) {
            index = counter++;
            values.set(value, index);
        }
        previousValue = value;
        return index;
    };

    /** @param {Iterable<T>} iterable */
    indexer.addAll = (iterable) => {
        for (const value of iterable) {
            indexer(value);
        }
    };

    /** @param {number} value */
    indexer.invert = (value) => {
        for (const entry of values.entries()) {
            if (entry[1] == value) {
                return entry[0];
            }
        }
    };

    indexer.domain = () => [...values.keys()];

    return indexer;
}
