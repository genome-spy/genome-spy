/**
 * Coalesces properties. Allows for creating chains of defaults without
 * using object destructuring, which may generate piles of garbage for GC.
 *
 * Still WIP.
 * TODO: Efficient computed defaults.
 * TODO: Make sense of the types
 *
 * @param  {...function():T} sources
 * @returns {T}
 *
 * @template {Record<string | symbol, any>} [T=object]
 */
export default function coalesceProperties(...sources) {
    /** @type {ProxyHandler<T>} */
    const handler = {
        get(_target, prop, _receiver) {
            for (const source of sources) {
                const props = source();
                const value = props[prop];
                if (value !== undefined) {
                    return value;
                }
            }
            return undefined;
        },

        // @ts-ignore
        has(target, prop, _receiver) {
            for (const source of sources) {
                const props = source();
                if (prop in props) {
                    return true;
                }
            }
            return false;
        },
    };

    // @ts-ignore
    return new Proxy({}, handler);
}
