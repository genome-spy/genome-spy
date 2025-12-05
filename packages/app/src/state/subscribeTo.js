/**
 * Subscribes to a selected slice of the Redux state.
 * Calls the listener when the selected slice changes.
 *
 * @template S Full store state type
 * @template T Selected slice type
 *
 * @param {import('@reduxjs/toolkit').Store<S>} store
 * @param {(state: S) => T} selector Function that extracts the slice
 * @param {(nextSlice: T, prevSlice: T) => void} listener
 *   Listener called when the slice changes
 * @param {(a: T, b: T) => boolean} [equals=(a, b) => a === b]
 *   Optional equality function (defaults to strict ===)
 *
 * @returns {() => void} unsubscribe function
 */
export function subscribeTo(
    store,
    selector,
    listener,
    equals = (a, b) => a === b
) {
    /** @type {T} */
    let prevSlice = selector(store.getState());

    return store.subscribe(() => {
        /** @type {S} */
        const state = store.getState();
        /** @type {T} */
        const nextSlice = selector(state);

        if (!equals(prevSlice, nextSlice)) {
            const prev = prevSlice;
            prevSlice = nextSlice;
            listener(nextSlice, prev);
        }
    });
}

/**
 * Wraps a listener so that it is called via `queueMicrotask`.
 * If the wrapped listener is invoked multiple times in the same tick,
 * it will actually run only once.
 *
 * @template T
 *
 * @param {(nextSlice: T, prevSlice: T) => void} listener
 * @returns {(nextSlice: T, prevSlice: T) => void}
 */
export function withMicrotask(listener) {
    let scheduled = false;

    /** @type {T} */
    let lastNextSlice;
    /** @type {T} */
    let firstPrevSlice;

    const run = () => {
        scheduled = false;
        listener(lastNextSlice, firstPrevSlice);
        firstPrevSlice = undefined;
    };

    return (nextSlice, prevSlice) => {
        lastNextSlice = nextSlice;
        firstPrevSlice ??= prevSlice;

        if (!scheduled) {
            scheduled = true;
            queueMicrotask(run);
        }
    };
}
