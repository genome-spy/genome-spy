import { beforeEach, describe, expect, test, vi } from "vitest";

const { createOrUpdateTextureMock } = vi.hoisted(() => ({
    createOrUpdateTextureMock: vi.fn((_gl, _options, src) => src),
}));

vi.mock("./webGLHelper.js", () => ({
    createOrUpdateTexture: createOrUpdateTextureMock,
}));

import { createSchemeTexture } from "./colorUtils.js";

const gl = {
    LINEAR: 9729,
    NEAREST: 9728,
    RGB: 6407,
    RED: 6403,
    R32F: 33326,
    CLAMP_TO_EDGE: 33071,
};

const firstColor = (texture) => Array.from(texture.slice(0, 3));
const lastColor = (texture) => Array.from(texture.slice(texture.length - 3));

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
