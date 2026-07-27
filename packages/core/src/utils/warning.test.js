import { expect, test, vi } from "vitest";
import { warnOnce } from "./warning.js";

test("prints each warning only once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    warnOnce("First warning");
    warnOnce("First warning");
    warnOnce("Second warning");

    expect(warn.mock.calls).toEqual([["First warning"], ["Second warning"]]);
    warn.mockRestore();
});
