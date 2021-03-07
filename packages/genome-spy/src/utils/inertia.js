import { lerp } from "vega-util";
import AxisView from "../view/axisView";

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
        this.damping = 10e-5;
        this.acceleration = 0.3;
        /** Use acceleration if the momentum step is greater than X */
        this.accelerationThreshold = 50;
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
        const timeDelta = timestamp - this.timestamp || 0;
        this.timestamp = timestamp;

        const damp = Math.pow(this.damping, timeDelta / 1000);
        this.momentum *= damp;

        this.callback(this.momentum); // TODO: This is actually a delta, should take elapsed time into account
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
    const accepted = ["string", "number", "boolean"];
    // eslint-disable-next-line guard-for-in
    for (const key in event) {
        const k = /** @type {keyof T} */ (key);
        if (accepted.includes(typeof event[k])) {
            template[k] = /** @type {any} */ (event[k]);
        }
    }
    return template;
}

/**
 *
 * @param {MouseEvent} mouseEvent
 * @returns {mouseEvent is WheelEvent}
 */
function isWheelEvent(mouseEvent) {
    return mouseEvent.type == "wheel";
}
