import { describe, expect, test, vi } from "vitest";

import { normalizeGroupBounds, TransientTexturePool } from "./renderGroups.js";

describe("TransientTexturePool", () => {
    test("reuses exact released attachments and destroys them once", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        const first = pool.acquire(
            100,
            50,
            4,
            GPUTextureUsage.RENDER_ATTACHMENT
        );
        pool.release(first);
        const reused = pool.acquire(
            100,
            50,
            4,
            GPUTextureUsage.RENDER_ATTACHMENT
        );
        const other = pool.acquire(
            100,
            50,
            1,
            GPUTextureUsage.RENDER_ATTACHMENT
        );

        expect(reused).toBe(first);
        expect(other).not.toBe(first);
        expect(device.createTexture).toHaveBeenCalledTimes(2);

        pool.destroy();
        pool.destroy();
        expect(
            textures.map((texture) => texture.destroy.mock.calls.length)
        ).toEqual([1, 1]);
    });

    test("evicts the oldest free attachment without touching in-use ones", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");
        const inUse = pool.acquire(1, 1, 1, GPUTextureUsage.RENDER_ATTACHMENT);

        for (let size = 2; size <= 10; size++) {
            pool.release(
                pool.acquire(size, 1, 1, GPUTextureUsage.RENDER_ATTACHMENT)
            );
        }

        expect(textures[0].destroy).not.toHaveBeenCalled();
        pool.destroyEvicted();
        expect(textures[1].destroy).toHaveBeenCalledOnce();
        pool.release(inUse);
        pool.destroy();
        expect(
            textures.every((texture) => texture.destroy.mock.calls.length === 1)
        ).toBe(true);
    });

    test("evicts by sample-pixel cost and rejects oversized releases", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");
        const firstLarge = pool.acquire(
            2_500,
            1_000,
            4,
            GPUTextureUsage.RENDER_ATTACHMENT
        );
        const secondLarge = pool.acquire(
            2_500,
            1_000,
            4,
            GPUTextureUsage.RENDER_ATTACHMENT
        );
        pool.release(firstLarge);
        pool.release(secondLarge);

        expect(textures[0].destroy).not.toHaveBeenCalled();
        pool.destroyEvicted();
        expect(textures[0].destroy).toHaveBeenCalledOnce();
        expect(textures[1].destroy).not.toHaveBeenCalled();

        const oversized = pool.acquire(
            5_000,
            1_000,
            4,
            GPUTextureUsage.RENDER_ATTACHMENT
        );
        pool.release(oversized);
        expect(textures[2].destroy).not.toHaveBeenCalled();
        pool.destroyEvicted();
        expect(textures[2].destroy).toHaveBeenCalledOnce();
        expect(
            pool.acquire(5_000, 1_000, 4, GPUTextureUsage.RENDER_ATTACHMENT)
        ).not.toBe(oversized);

        pool.destroy();
    });
});

function createDevice() {
    /** @type {{createView: ReturnType<typeof vi.fn>, destroy: ReturnType<typeof vi.fn>}[]} */
    const textures = [];
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            createTexture: vi.fn(() => {
                const texture = {
                    createView: vi.fn(() => ({})),
                    destroy: vi.fn(),
                };
                textures.push(texture);
                return texture;
            }),
        })
    );
    return { device, textures };
}

describe("normalizeGroupBounds", () => {
    test("rounds outward and clips to the physical canvas", () => {
        expect(
            normalizeGroupBounds(
                { x: -0.2, y: 2.2, width: 11.1, height: 20 },
                { width: 10, height: 8, dpr: 2 }
            )
        ).toEqual({
            width: 20,
            height: 12,
            logicalX: 0,
            logicalY: 2,
        });
    });
});
