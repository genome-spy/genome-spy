import { expect, test, vi } from "vitest";
import { debounce } from "./debounce.js";

test("runs without a browser window", async () => {
    vi.useFakeTimers();
    try {
        const callback = vi.fn();
        const debounced = debounce(callback, 10);

        const result = debounced("value");
        await vi.advanceTimersByTimeAsync(10);

        await expect(result).resolves.toBeUndefined();
        expect(callback).toHaveBeenCalledWith("value");
    } finally {
        vi.useRealTimers();
    }
});

test("cancels a pending callback", async () => {
    vi.useFakeTimers();
    try {
        const callback = vi.fn();
        const debounced = debounce(callback, 10);
        const result = debounced("value");
        const rejected = expect(result).rejects.toBe("debounced");

        debounced.cancel();
        await rejected;
        await vi.runAllTimersAsync();

        expect(callback).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    } finally {
        vi.useRealTimers();
    }
});
