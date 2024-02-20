import doTransition from "./transition.js";

export default class Animator {
    /**
     *
     * @param {function(number):void} renderCallback
     */
    constructor(renderCallback) {
        this._renderCallback = renderCallback;
        this._renderRequested = false;
        this._warn = false;

        /** @type {(function(number):void)[]} */
        this.transitions = [];
    }

    /**
     * Schedules a "transition" to be called before the actual rendering
     * is preformed. The transition could adjust the layout, for example.
     * This method also requests rendering to be performed.
     *
     * If the callback has already been requested (compared by identity),
     * it is removed from the queue and added to the end.
     *
     * @param {function(number):void} callback
     */
    requestTransition(callback) {
        this.cancelTransition(callback);
        this.transitions.push(callback);
        this.requestRender();
    }

    /**
     * @param {function(number):void} callback
     */
    cancelTransition(callback) {
        const existingIndex = this.transitions.indexOf(callback);
        if (existingIndex >= 0) {
            this.transitions.splice(existingIndex, 1);
        }
    }

    /**
     * Requests the request transitions and rendering callback to be called
     * during the next animation frame. Redundant calls to this method are safe,
     * they have no effect.
     */
    requestRender() {
        if (!this._renderRequested) {
            this._renderRequested = true;
            window.requestAnimationFrame((timestamp) => {
                this._renderRequested = false;

                const transitions = this.transitions;
                this.transitions = [];

                /** @type {function} */
                let transitionCallback;
                while ((transitionCallback = transitions.shift())) {
                    transitionCallback(timestamp);
                }

                this._renderCallback(timestamp);
            });
        } else if (this._warn) {
            console.warn("Render already requested!");
        }
    }

    /**
     * Initiates a transition with a `requestAnimationFrame` that is synced
     * with this Animator instance.
     *
     * @param {import("./transition.js").TransitionOptions} options
     */
    transition(options) {
        return doTransition({
            requestAnimationFrame: (callback) =>
                this.requestTransition(callback),
            ...options,
        });
    }
}

/**
 * Returns a lerp smoother that animates a value towards a target value. Lerp smoothing
 * is conceptually similar to easing, but can be used when the current and target
 * values are not known in advance.
 *
 * Read more at: https://www.gamedeveloper.com/programming/improved-lerp-smoothing-
 *
 * @param {import("../utils/animator.js").default} animator
 * @param {(value: T) => void} callback Function to be called with the interpolated value
 * @param {number} halfLife Time until half of the value is reached, in milliseconds
 * @param {number} stopAt Stop animation when the value is within this distance from the target
 * @param {T} initialValue Initial value
 * @returns {((target: T) => void) & { stop: () => void}} Function that activates the transition with a new target value
 * @template {Record<string, number>} T
 */
export function makeLerpSmoother(
    animator,
    callback,
    halfLife,
    stopAt,
    initialValue
) {
    let lastTimeStamp = 0;
    let settled = true;

    let current = structuredClone(initialValue);
    let target = current;

    /**
     * Smoother for a scalar.
     * Based on: https://twitter.com/FreyaHolmer/status/1757836988495847568
     *
     * @param {number} current
     * @param {number} target
     * @param {number} tD
     * @param {number} halfLife
     */
    function lerpSmooth(current, target, tD, halfLife) {
        return target + (current - target) * Math.pow(2, -tD / halfLife);
    }

    /**
     * @param {number} [timestamp]
     */
    function smoothUpdate(timestamp) {
        if (settled) {
            return;
        }

        const tD = timestamp - lastTimeStamp;
        lastTimeStamp = timestamp;

        for (const key of /** @type {(keyof T)[]} */ (Object.keys(target))) {
            current[key] = /** @type {T[keyof T]}*/ (
                lerpSmooth(current[key], target[key], tD, halfLife)
            );
        }

        callback(current);

        let maxDiff = -Infinity;
        for (const key of Object.keys(target)) {
            maxDiff = Math.max(maxDiff, Math.abs(target[key] - current[key]));
        }

        if (maxDiff < stopAt) {
            current = target;
            callback(current);
            settled = true;
            animator.requestRender();
        } else {
            animator.requestTransition((t) => smoothUpdate(t));
        }
    }

    /**
     * @param {T} value
     */
    function setTarget(value) {
        target = value;
        if (settled) {
            settled = false;
            lastTimeStamp = +document.timeline.currentTime;
            smoothUpdate(lastTimeStamp);
        }
    }

    setTarget.stop = () => {
        settled = true;
    };

    return setTarget;
}
