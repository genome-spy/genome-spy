import { describe, expect, test, vi } from "vitest";

import { normalizeGroupBounds, TransientTexturePool } from "./renderGroups.js";

describe("TransientTexturePool", () => {
    test("reuses exact released attachments and destroys them once", () => {
        const destroy = vi.fn();
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createTexture: vi.fn(() => ({
                    createView: vi.fn(() => ({})),
                    destroy,
                })),
            })
        );
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
        expect(destroy).toHaveBeenCalledTimes(2);
    });
});

describe("normalizeGroupBounds", () => {
    test("rounds outward and clips to the physical canvas", () => {
        expect(
            normalizeGroupBounds(
                { x: -0.2, y: 2.2, width: 11.1, height: 20 },
                { width: 10, height: 8, dpr: 2 }
            )
        ).toEqual({
            x: 0,
            y: 4,
            width: 20,
            height: 12,
            logicalX: 0,
            logicalY: 2,
            logicalWidth: 10,
            logicalHeight: 6,
        });
    });
});
