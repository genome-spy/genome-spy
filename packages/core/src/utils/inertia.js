import { lerp } from "vega-util";
import { makeLerpSmoother } from "./animator.js";
import clamp from "./clamp.js";

/**
 * Creates some inertia, mainly for zooming with a mechanical mouse wheel
 */
export default class Inertia {
    /**
     * @param {import("./animator.js").default} animator
     * @param {boolean} [disabled] Just call the callback directly
     */
    constructor(animator, disabled) {
        this.animator = animator;
        this.disabled = !!disabled;

        // Limit the velocity by setting the maximum distance the value can travel
        this.maxDistance = 500;

        /** @type {function(number):void} */
        this.callback = null;

        this.targetValue = 0;
        this.lastValue = 0;

        this.smoother = makeLerpSmoother(
            animator,
            (value) => {
                const delta = value.x - this.lastValue;
                this.lastValue = value.x;
                this.callback?.(delta);
            },
            40,
            0.1,
            { x: 0 }
        );
    }

    cancel() {
        if (this.lastValue === this.targetValue) {
            return;
        }

        // decelelerate rapidly
        this.targetValue = lerp([this.lastValue, this.targetValue], 0.3);
        this.smoother({ x: this.targetValue });
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

        this.callback = callback;

        const delta = clamp(
            this.targetValue + value - this.lastValue,
            -this.maxDistance,
            this.maxDistance
        );
        this.targetValue = this.lastValue + delta;

        this.smoother({ x: this.targetValue });
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
