/**
 * Returns a function that calls a listener when the selected part
 * of the provided state has changed.
 *
 * Inspired by: https://github.com/ExodusMovement/redux-watch
 *
 * @param {(state: S) => T} selector
 * @param {(value: T, oldValue: T) => void} listener
 * @param {S} [initialState]
 * @template S, T
 */
export function watch(selector, listener, initialState) {
    /** @type {T} */
    let oldValue = initialState && selector(initialState);

    return (/** @type {S} */ state) => {
        const value = selector(state);
        if (value !== oldValue) {
            listener(value, oldValue);
            oldValue = value;
        }
    };
}
