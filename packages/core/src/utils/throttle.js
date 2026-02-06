/**
 * https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
 *
 * @param {function} func
 * @param {number} limit
 * @returns {((...args: any[]) => void) & { cancel: () => void }}
 */
export default function throttle(func, limit) {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null;

    /** @type {number | null} */
    let lastRan = null;

    /** @type {IArguments | null} */
    let lastArgs = null;

    /** @type {any} */
    let lastContext = null;

    const throttled = function () {
        // eslint-disable-next-line no-invalid-this
        lastContext = this;
        // eslint-disable-next-line prefer-rest-params
        lastArgs = arguments;

        const now = Date.now();
        if (lastRan === null) {
            func.apply(lastContext, lastArgs);
            lastRan = now;
            return;
        }

        const remaining = limit - (now - lastRan);
        if (remaining <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            func.apply(lastContext, lastArgs);
            lastRan = now;
            return;
        }

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (lastRan !== null && Date.now() - lastRan >= limit) {
                func.apply(lastContext, lastArgs);
                lastRan = Date.now();
            }
        }, remaining);
    };

    throttled.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        lastArgs = null;
        lastContext = null;
        lastRan = null;
    };

    return throttled;
}
