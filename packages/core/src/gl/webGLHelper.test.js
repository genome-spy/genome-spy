import { beforeEach, expect, test, vi } from "vitest";

const colorTextureMocks = vi.hoisted(() => ({
    createDiscreteColorTexture: vi.fn(() => ({})),
    createDiscreteTexture: vi.fn(() => ({})),
    createInterpolatedColorTexture: vi.fn(() => ({})),
    createSchemeTexture: vi.fn(() => ({})),
}));

vi.mock("./colorUtils.js", () => ({
    ...colorTextureMocks,
    cssColorToArray: vi.fn(),
}));

import scale from "../scale/scale.js";
import WebGLHelper from "./webGLHelper.js";

beforeEach(() => {
    vi.clearAllMocks();
});

test("quantize textures use the scale's resolved color range", () => {
    // The resolved range samples interpolating schemes at the same points as CPU encoders.
    /** @type {import("../spec/scale.js").Scale} */
    const scaleProps = {
        type: "quantize",
        domain: [0, 120],
        scheme: { name: "turbo", count: 5 },
    };
    const quantizeScale = scale(scaleProps);
    quantizeScale.props = scaleProps;
    const helper = Object.create(WebGLHelper.prototype);
    helper.gl = {};
    helper.rangeTextures = new WeakMap();

    helper.createRangeTexture({
        channel: "color",
        getScale: () => quantizeScale,
    });

    expect(colorTextureMocks.createDiscreteColorTexture).toHaveBeenCalledWith(
        quantizeScale.range(),
        helper.gl,
        quantizeScale.range().length,
        undefined
    );
    expect(colorTextureMocks.createSchemeTexture).not.toHaveBeenCalled();
});
