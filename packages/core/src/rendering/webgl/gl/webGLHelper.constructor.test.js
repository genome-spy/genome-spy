// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getContext: vi.fn(),
}));

vi.mock("twgl.js", () => ({
    addExtensionsToContext: /** @returns {void} */ () => undefined,
    createFramebufferInfo: () => ({ framebuffer: {} }),
    createTexture: vi.fn(),
    getContext: mocks.getContext,
    isWebGL2: () => true,
    resizeFramebufferInfo: /** @returns {void} */ () => undefined,
    setTextureFromArray: /** @returns {void} */ () => undefined,
}));

import WebGLHelper from "./webGLHelper.js";

beforeEach(() => {
    vi.resetAllMocks();
});

test("does not attach a canvas when WebGL context creation fails", () => {
    mocks.getContext.mockReturnValue(null);
    const container = document.createElement("div");

    expect(() => new WebGLHelper(container)).toThrow(
        "Unable to initialize WebGL"
    );
    expect(container.querySelector("canvas")).toBeNull();
});

test("removes its canvas when late initialization fails", () => {
    mocks.getContext.mockReturnValue({
        ONE: 1,
        ONE_MINUS_SRC_ALPHA: 2,
        FRAMEBUFFER: 3,
        bindFramebuffer: vi.fn(),
        blendFunc: vi.fn(),
        getExtension: vi.fn(),
    });
    const container = document.createElement("div");

    expect(
        () =>
            new WebGLHelper(container, () => {
                throw new Error("Size failed");
            })
    ).toThrow("Size failed");
    expect(container.querySelector("canvas")).toBeNull();
});
