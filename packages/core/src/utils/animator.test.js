import { describe, expect, test } from "vitest";
import { makeLerpSmoother } from "./animator.js";

function createTestAnimator() {
    /** @type {((timestamp: number) => void)[]} */
    const callbacks = [];

    return {
        /** @param {(timestamp: number) => void} callback */
        requestTransition(callback) {
            const existingIndex = callbacks.indexOf(callback);
            if (existingIndex >= 0) {
                callbacks.splice(existingIndex, 1);
            }
            callbacks.push(callback);
        },
        /** @param {(timestamp: number) => void} callback */
        cancelTransition(callback) {
            const existingIndex = callbacks.indexOf(callback);
            if (existingIndex >= 0) {
                callbacks.splice(existingIndex, 1);
            }
        },
        requestRender() {
            //
        },
        /** @param {number} timestamp */
        step(timestamp) {
            const pending = callbacks.splice(0);
            for (const callback of pending) {
                callback(timestamp);
            }
        },
        pendingTransitionCount() {
            return callbacks.length;
        },
    };
}

describe("makeLerpSmoother", () => {
    test("coalesces rapid retargets into one pending frame", () => {
        const animator = createTestAnimator();
        /** @type {number[]} */
        const values = [];
        const smooth = makeLerpSmoother(
            /** @type {any} */ (animator),
            ({ value }) => values.push(value),
            100,
            0.001,
            { value: 0 }
        );

        smooth({ value: 1 });
        smooth({ value: 2 });
        smooth({ value: 3 });

        expect(animator.pendingTransitionCount()).toBe(1);

        animator.step(performance.now() + 100);

        expect(animator.pendingTransitionCount()).toBe(1);
        expect(values.at(-1)).toBeGreaterThan(1);
        expect(values.at(-1)).toBeLessThan(2);
    });

    test("stop cancels the pending frame", () => {
        const animator = createTestAnimator();
        const smooth = makeLerpSmoother(
            /** @type {any} */ (animator),
            () => undefined,
            100,
            0.001,
            { value: 0 }
        );

        smooth({ value: 1 });
        expect(animator.pendingTransitionCount()).toBe(1);

        smooth.stop();

        expect(animator.pendingTransitionCount()).toBe(0);
    });
});
