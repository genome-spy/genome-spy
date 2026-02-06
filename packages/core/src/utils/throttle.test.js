import { describe, expect, it, vi } from "vitest";
import throttle from "./throttle.js";

describe("throttle", () => {
    it("invokes immediately and uses the latest arguments on the trailing edge", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(0);
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled("first");
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenLastCalledWith("first");

            throttled("second");
            throttled("third");

            // Non-obvious: advancing timers also advances Date.now with fake timers.
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenLastCalledWith("third");
        } finally {
            vi.useRealTimers();
        }
    });

    it("cancels pending trailing calls", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(0);
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled("first");
            throttled("second");
            throttled.cancel();

            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenLastCalledWith("first");
        } finally {
            vi.useRealTimers();
        }
    });
});
