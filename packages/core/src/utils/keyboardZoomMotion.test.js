import { describe, expect, test } from "vitest";

import KeyboardZoomMotion from "./keyboardZoomMotion.js";

/**
 * @param {KeyboardZoomMotion} motion
 * @param {number} frameCount
 * @param {number} dtMs
 */
function stepMany(motion, frameCount, dtMs) {
    /** @type {{panDelta: number, zoomDelta: number, active: boolean}[]} */
    const steps = [];

    for (let i = 0; i < frameCount; i++) {
        steps.push(motion.step(dtMs));
    }

    return steps;
}

/**
 * @param {{panDelta: number, zoomDelta: number, active: boolean}[]} steps
 * @param {"panDelta" | "zoomDelta"} field
 */
function absoluteValues(steps, field) {
    return steps.map((step) => Math.abs(step[field]));
}

describe("KeyboardZoomMotion", () => {
    test("recognizes only WASD keys", () => {
        const motion = new KeyboardZoomMotion();

        expect(motion.isNavigationKey("KeyW")).toBe(true);
        expect(motion.isNavigationKey("KeyA")).toBe(true);
        expect(motion.isNavigationKey("KeyS")).toBe(true);
        expect(motion.isNavigationKey("KeyD")).toBe(true);
        expect(motion.isNavigationKey("KeyF")).toBe(false);
    });

    test("maps D to right-pan sign and W to zoom-in sign", () => {
        const motion = new KeyboardZoomMotion();

        motion.handleKeyDown("KeyD");
        const panStep = motion.step(16);
        motion.handleKeyUp("KeyD");

        motion.handleKeyDown("KeyW");
        const zoomStep = motion.step(16);

        expect(panStep.panDelta).toBeLessThan(0);
        expect(zoomStep.zoomDelta).toBeLessThan(0);
    });

    test("tap accelerates quickly and then brakes to halt", () => {
        const motion = new KeyboardZoomMotion();
        const dtMs = 16;

        motion.handleKeyDown("KeyW");
        const pressSteps = stepMany(motion, 6, dtMs);
        motion.handleKeyUp("KeyW");
        const releaseSteps = stepMany(motion, 90, dtMs);

        const pressAbs = absoluteValues(pressSteps, "zoomDelta");
        const releaseAbs = absoluteValues(releaseSteps, "zoomDelta");

        expect(pressAbs[1]).toBeGreaterThan(pressAbs[0]);
        expect(pressAbs[5]).toBeGreaterThan(pressAbs[2]);

        expect(releaseAbs[0]).toBeGreaterThan(releaseAbs[10]);
        expect(releaseAbs[10]).toBeGreaterThan(releaseAbs[40]);
        expect(releaseAbs[89]).toBeLessThan(0.0002);

        // Keep stepping until the braking tail settles to zero.
        let active = true;
        for (let i = 0; i < 180; i++) {
            active = motion.step(dtMs).active;
            if (!active) {
                break;
            }
        }

        expect(active).toBe(false);
    });

    test("long hold keeps accelerating after initial rapid start", () => {
        const motion = new KeyboardZoomMotion();
        const dtMs = 16;

        motion.handleKeyDown("KeyD");
        const early = stepMany(motion, 12, dtMs);
        const sustained = stepMany(motion, 140, dtMs);

        const earlySpeed = Math.abs(early[11].panDelta) / (dtMs / 1000);
        const sustainedSpeed =
            Math.abs(sustained[139].panDelta) / (dtMs / 1000);

        expect(sustainedSpeed).toBeGreaterThan(earlySpeed * 1.3);
    });

    test("opposite direction keys cancel the axis movement", () => {
        const motion = new KeyboardZoomMotion();

        motion.handleKeyDown("KeyA");
        motion.handleKeyDown("KeyD");
        const panStep = motion.step(16);

        motion.handleKeyDown("KeyW");
        motion.handleKeyDown("KeyS");
        const zoomStep = motion.step(16);

        expect(Math.abs(panStep.panDelta)).toBeLessThan(1e-8);
        expect(Math.abs(zoomStep.zoomDelta)).toBeLessThan(1e-8);
    });

    test("keyup uses the same braking curve as a tap tail", () => {
        const motion = new KeyboardZoomMotion();

        motion.handleKeyDown("KeyW");
        stepMany(motion, 60, 16);
        motion.handleKeyUp("KeyW");

        const braking = stepMany(motion, 20, 16);
        const abs = absoluteValues(braking, "zoomDelta");

        expect(abs[0]).toBeGreaterThan(abs[5]);
        expect(abs[5]).toBeGreaterThan(abs[15]);
    });
});
