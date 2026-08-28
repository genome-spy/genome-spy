import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    initialize: vi.fn(),
}));

vi.mock("./webGpuSurface.js", () => ({
    default: class WebGpuSurface {
        initialize = mocks.initialize;
    },
}));

import { createWebGpuRenderingBackend } from "./index.js";

test("supplies Core's bundled default font bitmap", async () => {
    const backend = await createWebGpuRenderingBackend(/** @type {any} */ ({}));

    expect(backend.defaultFontBitmapUrl).toContain("Lato-Regular.png");
});
