import { beforeEach, describe, expect, test, vi } from "vitest";

const { createOrUpdateTextureMock } = vi.hoisted(() => ({
    createOrUpdateTextureMock: vi.fn((_gl, _options, src) => src),
}));

vi.mock("./webGLHelper.js", () => ({
    createOrUpdateTexture: createOrUpdateTextureMock,
}));

import {
    createSchemeTexture,
    createDiscreteColorTexture,
    createInterpolatedColorTexture,
} from "./colorUtils.js";

const gl = /** @type {WebGL2RenderingContext} */ (
    /** @type {unknown} */ ({
        LINEAR: 9729,
        NEAREST: 9728,
        RGBA: 6408,
        RED: 6403,
        R32F: 33326,
        CLAMP_TO_EDGE: 33071,
    })
);

/** @param {unknown} texture */
const firstColor = (texture) =>
    Array.from(/** @type {Uint8Array} */ (texture).slice(0, 4));

/** @param {unknown} texture */
const lastColor = (texture) => {
    const bytes = /** @type {Uint8Array} */ (texture);
    return Array.from(bytes.slice(bytes.length - 4));
};

describe("createSchemeTexture", () => {
    beforeEach(() => {
        createOrUpdateTextureMock.mockClear();
    });

    test("reverses interpolating scheme textures", () => {
        // The mocked createOrUpdateTexture returns raw texture bytes for direct assertions.
        const forward = createSchemeTexture("viridis", gl, 32);
        const reversed = createSchemeTexture(
            "viridis",
            gl,
            32,
            undefined,
            true
        );

        expect(forward).toBeInstanceOf(Uint8Array);
        expect(reversed).toBeInstanceOf(Uint8Array);
        expect(firstColor(reversed)).toEqual(lastColor(forward));
        expect(lastColor(reversed)).toEqual(firstColor(forward));
    });

    test("reverses discrete scheme textures", () => {
        // Category10 resolves to a discrete color array.
        const forward = createSchemeTexture("category10", gl);
        const reversed = createSchemeTexture(
            "category10",
            gl,
            undefined,
            undefined,
            true
        );

        expect(forward).toBeInstanceOf(Uint8Array);
        expect(reversed).toBeInstanceOf(Uint8Array);
        expect(firstColor(reversed)).toEqual(lastColor(forward));
        expect(lastColor(reversed)).toEqual(firstColor(forward));
    });
});

test("retains alpha in discrete and interpolated color textures", () => {
    const colors = ["transparent", "rgba(255, 0, 0, 0.5)", "#00ff0080", "blue"];
    const discrete = createDiscreteColorTexture(colors, gl);
    expect(Array.from(/** @type {Uint8Array} */ (discrete))).toEqual([
        0, 0, 0, 0, 255, 0, 0, 127, 0, 255, 0, 128, 0, 0, 255, 255,
    ]);
    expect(createOrUpdateTextureMock).toHaveBeenLastCalledWith(
        gl,
        expect.objectContaining({ format: gl.RGBA }),
        discrete,
        undefined
    );

    const ramp = createInterpolatedColorTexture(
        ["transparent", "red"],
        "rgb",
        gl
    );
    expect(firstColor(ramp)[3]).toBe(0);
    expect(lastColor(ramp)).toEqual([255, 0, 0, 255]);
    const bytes = /** @type {Uint8Array} */ (ramp);
    expect(bytes[128 * 4 + 3]).toBe(128);
});
