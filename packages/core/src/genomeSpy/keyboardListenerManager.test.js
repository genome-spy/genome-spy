// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import KeyboardListenerManager from "./keyboardListenerManager.js";

test("unsubscribes one keyboard owner and finalizes remaining listeners", () => {
    const manager = new KeyboardListenerManager();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = manager.add("keydown", first);
    manager.add("keydown", second);

    try {
        document.dispatchEvent(new KeyboardEvent("keydown"));
        unsubscribe();
        document.dispatchEvent(new KeyboardEvent("keydown"));

        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledTimes(2);

        manager.removeAll();
        document.dispatchEvent(new KeyboardEvent("keydown"));
        expect(second).toHaveBeenCalledTimes(2);
    } finally {
        manager.removeAll();
    }
});
