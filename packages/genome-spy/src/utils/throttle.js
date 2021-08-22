/* eslint-disable consistent-this */

/**
 * https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
 *
 * @param {function} func
 * @param {number} limit
 */
export default function throttle(func, limit) {
    /** @type {number} */
    let lastFunc;

    /** @type {number} */
    let lastRan;

    return function () {
        // eslint-disable-next-line no-invalid-this
        const context = this;
        // eslint-disable-next-line prefer-rest-params
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = window.setTimeout(function () {
                if (Date.now() - lastRan >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}
