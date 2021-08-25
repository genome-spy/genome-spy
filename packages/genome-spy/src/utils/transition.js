/**
 * @param {TransitionOptions} options
 *
 * @typedef {Object} TransitionOptions
 * @prop {number} [from] default: 0
 * @prop {number} [to] default: 1
 * @prop {number} [duration] in milliseconds, default: 1000
 * @prop {function(number):void} onUpdate
 * @prop {function(number):number} [easingFunction] default: linear
 * @prop {function(function(number):void):void} [requestAnimationFrame]
 *      default: window.requestAnimationFrame
 * @prop {AbortSignal} [signal]
 */
export default function transition(options) {
    const requestAnimationFrame =
        options.requestAnimationFrame || window.requestAnimationFrame;

    const signal = options.signal;

    if (signal?.aborted) {
        return Promise.reject("aborted");
    }

    return new Promise((resolve, reject) => {
        const beginTimestamp = performance.now();
        const endTimestamp = beginTimestamp + (options.duration || 1000);

        const from = typeof options.from == "number" ? options.from : 0;
        const to = typeof options.to == "number" ? options.to : 1;
        const ease = options.easingFunction || ((x) => x);

        /** @param {number} x */
        const toUnit = (x) =>
            (x - beginTimestamp) / (endTimestamp - beginTimestamp);

        /** @param {number} x */
        const toRange = (x) => x * (to - from) + from;

        /** @param {number} x */
        const clamp = (x) => Math.max(0, Math.min(1, x));

        /** @param {number} stamp */
        const step = (stamp) => {
            if (signal?.aborted) {
                reject("aborted");
            } else {
                options.onUpdate(toRange(ease(clamp(toUnit(stamp)))));
                if (stamp < endTimestamp) {
                    requestAnimationFrame(step);
                } else {
                    options.onUpdate(toRange(ease(1)));
                    resolve();
                }
            }
        };

        requestAnimationFrame(step);
    });
}
