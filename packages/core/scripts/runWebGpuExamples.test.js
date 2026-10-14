import { afterEach, expect, test, vi } from "vitest";
import { runExample } from "./runWebGpuExamples.mjs";

afterEach(() => vi.restoreAllMocks());

test("reports a crashed WebGPU example and closes its page so the audit can continue", async () => {
    // A crashed page cannot evaluate the audit script in the runner's finally block.
    const page = {
        addInitScript: vi.fn(),
        on: vi.fn(),
        goto: vi.fn().mockRejectedValue(new Error("Page crashed")),
        evaluate: vi.fn().mockRejectedValue(new Error("Target crashed")),
        close: vi.fn(),
    };
    const browser = /** @type {import("playwright").Browser} */ (
        /** @type {unknown} */ ({ newPage: vi.fn().mockResolvedValue(page) })
    );
    vi.spyOn(globalThis.console, "log").mockImplementation(() => {});

    const result = await runExample(
        browser,
        "http://127.0.0.1:4173",
        "examples/core/first.json",
        "webgpu",
        "/unused",
        1000,
        false,
        1,
        1200,
        700,
        false
    );

    expect(result.status).toBe("failed");
    expect(result.renderingFailures).toEqual([
        "Page crashed",
        "Could not collect WebGPU limit audit: Target crashed",
        "No default-limit WebGPU device was created.",
    ]);
    expect(result.gpuLimits.devices).toEqual([]);
    expect(page.close).toHaveBeenCalledOnce();
});
