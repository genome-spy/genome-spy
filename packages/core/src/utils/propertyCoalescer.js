/**
 * Coalesces properties. Allows for creating chains of defaults without
 * using object destructuring, which may generate piles of garbage for GC.
 *
 * Still WIP. TODO: Efficient computed defaults.
 *
 * @param  {...function():T} sources
 * @returns {T}
 *
 * @template T
 */
export default function coalesceProperties(...sources) {
    const handler = {
        get: function (target, prop, receiver) {
            for (const source of sources) {
                const props = source();
                const value = props[prop];
                if (value !== undefined) {
                    return value;
                }
            }
            return undefined;
        },

        has: function (target, prop, receiver) {
            for (const source of sources) {
                const props = source();
                if (prop in props) {
                    return true;
                }
            }
            return false;
        },
    };

    return new Proxy({}, handler);
}
