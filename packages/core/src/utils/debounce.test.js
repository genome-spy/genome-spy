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
