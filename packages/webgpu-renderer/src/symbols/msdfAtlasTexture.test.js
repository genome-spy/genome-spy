import { describe, expect, test, vi } from "vitest";

import { MsdfAtlasTexture } from "./msdfAtlasTexture.js";

describe("MsdfAtlasTexture", () => {
    test("grows geometrically, preserves content, and notifies once", async () => {
        const { device, encoders, resolveWork, textures } = createDevice();
        const atlas = new MsdfAtlasTexture(device, {
            width: 64,
            height: 32,
        });
        const listener = vi.fn();
        atlas.subscribe(listener);

        expect(atlas.grow(65, 20)).toBe(true);
        expect(atlas).toMatchObject({ width: 128, height: 32, version: 2 });
        expect(encoders[0].copyTextureToTexture).toHaveBeenCalledWith(
            { texture: textures[0] },
            { texture: textures[1] },
            [64, 32]
        );
        expect(listener).toHaveBeenCalledOnce();
        expect(textures[0].destroy).not.toHaveBeenCalled();
        expect(atlas.grow(100, 30)).toBe(false);

        resolveWork();
        await Promise.resolve();
        expect(textures[0].destroy).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledOnce();

        atlas.destroy();
        atlas.destroy();
        expect(textures[1].destroy).toHaveBeenCalledOnce();
    });

    test("rejects growth beyond the device texture limit", () => {
        const { device } = createDevice(128);
        const atlas = new MsdfAtlasTexture(device, {
            width: 64,
            height: 64,
        });

        expect(() => atlas.grow(129, 64)).toThrow(
            "Invalid MSDF atlas texture dimensions."
        );
        atlas.destroy();
    });

    test("supports denser geometric growth for incremental atlases", () => {
        const { device } = createDevice();
        const atlas = new MsdfAtlasTexture(device, {
            width: 512,
            height: 128,
            growthFactor: 1.5,
        });

        atlas.grow(512, 877);

        expect(atlas).toMatchObject({ width: 512, height: 972, version: 2 });
        atlas.destroy();
    });

    test("rejects invalid geometric growth factors", () => {
        const { device } = createDevice();

        expect(
            () =>
                new MsdfAtlasTexture(device, {
                    width: 64,
                    height: 64,
                    growthFactor: 1,
                })
        ).toThrow("growth factor must be greater than one");
    });
});

/** @param {number} [maxTextureDimension2D] */
function createDevice(maxTextureDimension2D = 4096) {
    /** @type {{destroy: ReturnType<typeof vi.fn>}[]} */
    const textures = [];
    /** @type {{copyTextureToTexture: ReturnType<typeof vi.fn>, finish: ReturnType<typeof vi.fn>}[]} */
    const encoders = [];
    let resolveWork = () => {};
    const workDone = new Promise((resolve) => {
        resolveWork = () => resolve(undefined);
    });
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            limits: { maxTextureDimension2D },
            createTexture: vi.fn(() => {
                const texture = { destroy: vi.fn() };
                textures.push(texture);
                return texture;
            }),
            createCommandEncoder: vi.fn(() => {
                const encoder = {
                    copyTextureToTexture: vi.fn(),
                    finish: vi.fn(() => ({})),
                };
                encoders.push(encoder);
                return encoder;
            }),
            queue: {
                submit: vi.fn(),
                onSubmittedWorkDone: vi.fn(() => workDone),
            },
        })
    );
    return { device, encoders, resolveWork, textures };
}
