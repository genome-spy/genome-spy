import { describe, expect, test, vi } from "vitest";

import { TransientTexturePool } from "./renderGroups.js";

describe("TransientTexturePool", () => {
    test("reuses exact released attachments and destroys them once", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        const first = pool.acquire(100, 50, 4);
        pool.release(first);
        const reused = pool.acquire(100, 50, 4);
        const other = pool.acquire(100, 50, 1);

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
        const inUse = pool.acquire(1, 1, 1);

        for (let size = 2; size <= 10; size++) {
            pool.release(pool.acquire(size, 1, 1));
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
        const firstLarge = pool.acquire(2_500, 1_000, 4);
        const secondLarge = pool.acquire(2_500, 1_000, 4);
        pool.release(firstLarge);
        pool.release(secondLarge);

        expect(textures[0].destroy).not.toHaveBeenCalled();
        pool.destroyEvicted();
        expect(textures[0].destroy).toHaveBeenCalledOnce();
        expect(textures[1].destroy).not.toHaveBeenCalled();

        const oversized = pool.acquire(5_000, 1_000, 4);
        pool.release(oversized);
        expect(textures[2].destroy).not.toHaveBeenCalled();
        pool.destroyEvicted();
        expect(textures[2].destroy).toHaveBeenCalledOnce();
        expect(pool.acquire(5_000, 1_000, 4)).not.toBe(oversized);

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
