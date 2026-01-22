/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lightweight cancellation token for transitions.
 * Use this when you want a cheap, synchronous cancel path without errors.
 *
 * @returns {{ canceled: boolean }}
 */
export function createCancelToken() {
    return { canceled: false };
}

/**
 * @param {TransitionOptions} options
 *
 * @typedef {Object} TransitionOptions
 * @prop {number} [from] default: 0
 * @prop {number} [to] default: 1
 * @prop {number} [duration] in milliseconds, default: 1000
 * @prop {number} [delay] milliseconds to wait before the transition starts, default: 0
 * @prop {function(number):void} onUpdate
 * @prop {function(number):number} [easingFunction] default: linear
 * @prop {function(function(number):void):void} [requestAnimationFrame]
 *      default: window.requestAnimationFrame
 * @prop {AbortSignal} [signal]
 * @prop {{ canceled: boolean }} [cancelToken]
 *      Prefer this for internal transitions where cancellation is expected and should be cheap.
 *      The transition resolves immediately when canceled and does not throw or reject.
 *      Use AbortSignal when you need external orchestration or standardized cancellation.
 */
export default function transition(options) {
    const requestAnimationFrame =
        options.requestAnimationFrame || window.requestAnimationFrame;

    const signal = options.signal;
    const cancelToken = options.cancelToken;

    const makePromise = () =>
        new Promise((resolve, reject) => {
            if (cancelToken?.canceled) {
                return resolve();
            }

            if (signal?.aborted) {
                return reject("aborted");
            }

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
                if (cancelToken?.canceled) {
                    resolve();
                    return;
                }

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

    if (options.delay) {
        if (cancelToken?.canceled) {
            return Promise.resolve();
        }

        if (signal?.aborted) {
            return Promise.reject("aborted");
        }

        return wait(options.delay).then(makePromise);
    } else {
        return makePromise();
    }
}
