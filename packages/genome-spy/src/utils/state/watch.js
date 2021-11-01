/**
 * Returns a function that calls a listener when the selected part
 * of the provided state has changed.
 *
 * Inspired by: https://github.com/ExodusMovement/redux-watch
 *
 * @param {(state: S) => T} selector
 * @param {(value: T, oldValue: T) => void} listener
 * @template S, T
 */
export function watch(selector, listener) {
    /** @type {T} */
    let oldValue;

    return (/** @type {S} */ state) => {
        const value = selector(state);
        if (value !== oldValue) {
            listener(value, oldValue);
            oldValue = value;
        }
    };
}
