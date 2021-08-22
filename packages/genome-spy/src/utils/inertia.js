import { lerp } from "vega-util";

/**
 * Creates some inertia, mainly for zooming with a mechanical mouse wheel
 */
export default class Inertia {
    /**
     * @param {import("./animator").default} animator
     * @param {boolean} [disabled] Just call the callback directly
     */
    constructor(animator, disabled) {
        this.animator = animator;
        this.disabled = !!disabled;
        this.damping = 0.015;
        this.acceleration = 0.3; // per event
        /** Use acceleration if the momentum step is greater than X */
        this.accelerationThreshold = 100;
        this.lowerLimit = 0.5; // When to stop updating
        this.loop = false;

        this.momentum = 0;
        this.timestamp = 0;
        /** @type {function(number):void} */
        this.callback = null;

        this._transitionCallback = this.animate.bind(this);
        this.clear();
    }

    clear() {
        /** @type {number} */
        this.momentum = 0;
        this.timestamp = null;
        this.loop = null;
        this.callback = null;
    }

    cancel() {
        if (this.loop) {
            this.animator.cancelTransition(this._transitionCallback);
            this.clear();
        }
    }

    /**
     *
     * @param {number} value
     * @param {function(number):void} callback
     */
    setMomentum(value, callback) {
        if (this.disabled) {
            callback(value);
            return;
        }

        // This may have some use in the future to improve the behavior of
        // a mechanical mouse wheel:
        // https://github.com/w3c/uievents/issues/181

        if (value * this.momentum < 0) {
            this.momentum = 0; // Stop if the direction changes
        } else if (Math.abs(value) > this.accelerationThreshold) {
            this.momentum = lerp([this.momentum, value], this.acceleration);
        } else {
            this.momentum = value;
        }

        this.callback = callback;

        if (!this.loop) {
            this.animate();
        }
    }

    /**
     *
     * @param {number} [timestamp]
     */
    animate(timestamp) {
        this.callback(this.momentum); // TODO: This is actually a delta, should take the elapsed time into account

        const timeDelta = timestamp - this.timestamp || 0;
        this.timestamp = timestamp;

        const velocity = Math.abs(this.momentum);

        this.momentum =
            Math.sign(this.momentum) *
            Math.max(
                0,
                velocity - ((velocity * this.damping) ** 1.5 + 0.04) * timeDelta
            );

        if (Math.abs(this.momentum) > this.lowerLimit) {
            this.loop = true;
            this.animator.requestTransition(this._transitionCallback);
        } else {
            this.clear();
        }
    }
}

/**
 * @param {T} event
 * @template T
 */
export function makeEventTemplate(event) {
    /** @type {Partial<Record<keyof T, any>>} */
    const template = {};
    const acceptedTypes = ["string", "number", "boolean"];
    const rejectedProps = ["wheelDelta", "wheelDeltaX", "wheelDeltaY"];

    // eslint-disable-next-line guard-for-in
    for (const key in event) {
        const k = /** @type {keyof T} */ (key);
        if (
            !rejectedProps.includes(key) &&
            acceptedTypes.includes(typeof event[k])
        ) {
            template[k] = /** @type {any} */ (event[k]);
        }
    }
    return template;
}
