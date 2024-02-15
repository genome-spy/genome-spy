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
 * @param {(value: number) => void} callback Function to be called with the interpolated value
 * @param {number} halfLife Time until half of the value is reached, in milliseconds
 * @param {number} stopAt Stop animation when the value is within this distance from the target
 * @param {number} [initialValue] Initial value
 * @returns {(target: number) => void} Function that activates the transition with a new target value
 */
export function makeLerpSmoother(
    animator,
    callback,
    halfLife,
    stopAt,
    initialValue = 0
) {
    let lastTimeStamp = 0;
    let settled = true;

    let current = initialValue;
    let target = current;

    /**
     * @param {number} [timestamp]
     */
    function smoothUpdate(timestamp) {
        timestamp ??= +document.timeline.currentTime;

        // If settled, the animation loop may have been stopped, so we need to
        // wait until the next frame to get a proper time delta.
        const tD = settled ? 0 : timestamp - lastTimeStamp;
        lastTimeStamp = timestamp;

        settled = false;

        // Lerp smoothing: https://twitter.com/FreyaHolmer/status/1757836988495847568
        current = target + (current - target) * Math.pow(2, -tD / halfLife);

        callback(current);

        if (Math.abs(target - current) < stopAt) {
            current = target;
            callback(current);
            settled = true;
            animator.requestRender();
        } else {
            animator.requestTransition((t) => smoothUpdate(t));
        }
    }

    /**
     * @param {number} value
     */
    return function setTarget(value) {
        target = value;
        if (settled) {
            smoothUpdate();
        }
    };
}
