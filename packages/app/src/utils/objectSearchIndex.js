/**
 * @template T
 * @typedef {{
 *   item: T,
 *   key: string,
 *   normalizedKey: string,
 *   insertionOrder: number,
 * }} IndexedEntry
 */

/**
 * @template T
 */
export default class ObjectSearchIndex {
    /** @type {(item: T) => string} */
    #keyAccessor;

    /** @type {IndexedEntry<T>[]} */
    #entries;

    /**
     * @param {T[]} items
     * @param {(item: T) => string} keyAccessor
     */
    constructor(items, keyAccessor) {
        this.#keyAccessor = keyAccessor;
        this.#entries = [];
        this.replace(items);
    }

    /**
     * Replaces the backing array and rebuilds the sorted index.
     *
     * @param {T[]} items
     */
    replace(items) {
        this.#entries = items
            .map((item, insertionOrder) => {
                const key = String(this.#keyAccessor(item));
                return {
                    item,
                    key,
                    normalizedKey: key.toLowerCase(),
                    insertionOrder,
                };
            })
            .sort((a, b) => {
                const byNormalized = a.normalizedKey.localeCompare(
                    b.normalizedKey
                );
                if (byNormalized !== 0) {
                    return byNormalized;
                }

                const byKey = a.key.localeCompare(b.key);
                if (byKey !== 0) {
                    return byKey;
                }

                return a.insertionOrder - b.insertionOrder;
            });
    }

    /**
     * Returns matching objects whose key starts with the given prefix.
     * Comparison is case-insensitive.
     *
     * @param {string} prefix
     * @returns {IterableIterator<T>}
     */
    *searchByPrefix(prefix) {
        const entries = this.#entries;
        if (entries.length === 0) {
            return;
        }

        const normalizedPrefix = String(prefix).toLowerCase();
        const startIndex =
            normalizedPrefix.length === 0
                ? 0
                : this.#lowerBound(entries, normalizedPrefix);

        for (let i = startIndex; i < entries.length; i++) {
            const entry = entries[i];
            if (
                normalizedPrefix.length > 0 &&
                !entry.normalizedKey.startsWith(normalizedPrefix)
            ) {
                break;
            }

            yield entry.item;
        }
    }

    /**
     * Finds the first index where normalizedKey >= normalizedPrefix.
     *
     * @param {IndexedEntry<T>[]} entries
     * @param {string} normalizedPrefix
     * @returns {number}
     */
    #lowerBound(entries, normalizedPrefix) {
        let low = 0;
        let high = entries.length;

        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (
                entries[mid].normalizedKey.localeCompare(normalizedPrefix) < 0
            ) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low;
    }
}
