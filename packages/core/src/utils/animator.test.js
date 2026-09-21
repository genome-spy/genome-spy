// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import Animator, { makeLerpSmoother } from "./animator.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Animator", () => {
    test("cancels a pending render when finalized", () => {
        /** @type {FrameRequestCallback | undefined} */
        let pendingCallback;
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(
            (callback) => {
                pendingCallback = callback;
                return 17;
            }
        );
        const cancelAnimationFrame = vi
            .spyOn(window, "cancelAnimationFrame")
            .mockImplementation(() => undefined);
        const render = vi.fn();
        const animator = new Animator(render);

        animator.requestRender();
        animator.finalize();
        pendingCallback?.(performance.now());
        animator.requestRender();

        expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
        expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
        expect(render).not.toHaveBeenCalled();
    });

    test("does not render when a transition finalizes the animator", () => {
        /** @type {FrameRequestCallback | undefined} */
        let pendingCallback;
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(
            (callback) => {
                pendingCallback = callback;
                return 23;
            }
        );
        const render = vi.fn();
        const animator = new Animator(render);

        animator.requestTransition(() => animator.finalize());
        pendingCallback?.(performance.now());

        expect(render).not.toHaveBeenCalled();
    });
});

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
