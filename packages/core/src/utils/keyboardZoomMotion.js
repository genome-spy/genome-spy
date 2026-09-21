/**
 * @typedef {"KeyW" | "KeyA" | "KeyS" | "KeyD"} NavigationKeyCode
 */

/**
 * @typedef {object} AxisProfile
 * @prop {number} baseSpeed Target speed reached rapidly after key press.
 * @prop {number} maxExtraSpeed Additional speed gained during sustained hold.
 * @prop {number} pressHalfLifeMs Half-life for accelerating toward target speed.
 * @prop {number} releaseHalfLifeMs Half-life for braking velocity after release.
 * @prop {number} holdGrowthHalfLifeMs Half-life for hold-time extra acceleration.
 * @prop {number} stopVelocity Velocity threshold below which motion snaps to zero.
 */

/**
 * @typedef {object} AxisState
 * @prop {number} velocity
 * @prop {number} holdMs
 * @prop {-1 | 0 | 1} direction
 */

/**
 * @typedef {object} MotionStep
 * @prop {number} panDelta
 * @prop {number} zoomDelta
 * @prop {boolean} active
 */

/**
 * Tuned for fast key-tap response, one-second-ish braking, and gradual
 * acceleration during long key holds.
 */
export const DEFAULT_KEYBOARD_ZOOM_MOTION_CONFIG = {
    pan: {
        baseSpeed: 1,
        maxExtraSpeed: 3,
        pressHalfLifeMs: 30,
        releaseHalfLifeMs: 100,
        holdGrowthHalfLifeMs: 800,
        stopVelocity: 0.01,
    },
    zoom: {
        baseSpeed: 3,
        maxExtraSpeed: 15,
        pressHalfLifeMs: 10,
        releaseHalfLifeMs: 100,
        holdGrowthHalfLifeMs: 600,
        stopVelocity: 0.01,
    },
};

/**
 * Handles smooth WASD navigation motion with acceleration and braking.
 */
export default class KeyboardZoomMotion {
    /** @type {Record<NavigationKeyCode, boolean>} */
    #pressed;

    /** @type {AxisState} */
    #pan;

    /** @type {AxisState} */
    #zoom;

    #panProfile;

    #zoomProfile;

    /**
     * @param {typeof DEFAULT_KEYBOARD_ZOOM_MOTION_CONFIG} [config]
     */
    constructor(config = DEFAULT_KEYBOARD_ZOOM_MOTION_CONFIG) {
        this.#panProfile = config.pan;
        this.#zoomProfile = config.zoom;

        this.#pressed = {
            KeyW: false,
            KeyA: false,
            KeyS: false,
            KeyD: false,
        };

        this.#pan = {
            velocity: 0,
            holdMs: 0,
            direction: 0,
        };

        this.#zoom = {
            velocity: 0,
            holdMs: 0,
            direction: 0,
        };
    }

    /**
     * @param {string} code
     */
    isNavigationKey(code) {
        return (
            code === "KeyW" ||
            code === "KeyA" ||
            code === "KeyS" ||
            code === "KeyD"
        );
    }

    /**
     * @param {string} code
     * @returns {boolean} true if the key state changed
     */
    handleKeyDown(code) {
        return this.#setPressed(code, true);
    }

    /**
     * @param {string} code
     * @returns {boolean} true if the key state changed
     */
    handleKeyUp(code) {
        return this.#setPressed(code, false);
    }

    reset() {
        this.#pressed.KeyW = false;
        this.#pressed.KeyA = false;
        this.#pressed.KeyS = false;
        this.#pressed.KeyD = false;

        this.#pan.velocity = 0;
        this.#pan.holdMs = 0;
        this.#pan.direction = 0;

        this.#zoom.velocity = 0;
        this.#zoom.holdMs = 0;
        this.#zoom.direction = 0;
    }

    /**
     * @param {number} dtMs
     * @returns {MotionStep}
     */
    step(dtMs) {
        if (dtMs <= 0) {
            return {
                panDelta: 0,
                zoomDelta: 0,
                active: this.isActive(),
            };
        } else {
            const panDirection = axisDirection(
                this.#pressed.KeyD,
                this.#pressed.KeyA
            );
            const zoomDirection = axisDirection(
                this.#pressed.KeyW,
                this.#pressed.KeyS
            );

            const panVelocity = updateAxis(
                this.#pan,
                panDirection,
                dtMs,
                this.#panProfile
            );
            const zoomVelocity = updateAxis(
                this.#zoom,
                zoomDirection,
                dtMs,
                this.#zoomProfile
            );

            const dtSeconds = dtMs / 1000;

            return {
                panDelta: panVelocity * dtSeconds,
                zoomDelta: zoomVelocity * dtSeconds,
                active: this.isActive(),
            };
        }
    }

    isActive() {
        if (
            this.#pressed.KeyW ||
            this.#pressed.KeyA ||
            this.#pressed.KeyS ||
            this.#pressed.KeyD
        ) {
            return true;
        } else {
            return this.#pan.velocity !== 0 || this.#zoom.velocity !== 0;
        }
    }

    /**
     * @param {string} code
     * @param {boolean} pressed
     * @returns {boolean}
     */
    #setPressed(code, pressed) {
        if (!this.isNavigationKey(code)) {
            return false;
        } else {
            const keyCode = /** @type {NavigationKeyCode} */ (code);
            const previous = this.#pressed[keyCode];
            if (previous === pressed) {
                return false;
            } else {
                this.#pressed[keyCode] = pressed;
                return true;
            }
        }
    }
}

/**
 * @param {boolean} negative
 * @param {boolean} positive
 * @returns {-1 | 0 | 1}
 */
function axisDirection(negative, positive) {
    if (negative === positive) {
        return 0;
    } else if (positive) {
        return 1;
    } else {
        return -1;
    }
}

/**
 * @param {AxisState} axis
 * @param {-1 | 0 | 1} direction
 * @param {number} dtMs
 * @param {AxisProfile} profile
 * @returns {number}
 */
function updateAxis(axis, direction, dtMs, profile) {
    if (direction !== 0) {
        if (axis.direction !== direction) {
            axis.holdMs = 0;
        }

        axis.holdMs += dtMs;

        const extraSpeed =
            profile.maxExtraSpeed *
            (1 - Math.pow(2, -axis.holdMs / profile.holdGrowthHalfLifeMs));

        const target = direction * (profile.baseSpeed + extraSpeed);

        axis.velocity = smoothApproach(
            axis.velocity,
            target,
            dtMs,
            profile.pressHalfLifeMs
        );
    } else {
        axis.holdMs = 0;
        axis.velocity = smoothApproach(
            axis.velocity,
            0,
            dtMs,
            profile.releaseHalfLifeMs
        );

        if (Math.abs(axis.velocity) < profile.stopVelocity) {
            axis.velocity = 0;
        }
    }

    axis.direction = direction;
    return axis.velocity;
}

/**
 * @param {number} current
 * @param {number} target
 * @param {number} dtMs
 * @param {number} halfLifeMs
 */
function smoothApproach(current, target, dtMs, halfLifeMs) {
    return target + (current - target) * Math.pow(2, -dtMs / halfLifeMs);
}
