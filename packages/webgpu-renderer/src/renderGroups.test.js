import { describe, expect, test, vi } from "vitest";

import { TextureCompositor, TransientTexturePool } from "./renderGroups.js";

describe("TransientTexturePool", () => {
    test("reuses exact released attachments within a frame", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        pool.beginFrame();
        const first = pool.acquire(100, 50, 4);
        pool.release(first);
        const reused = pool.acquire(100, 50, 4);
        const other = pool.acquire(100, 50, 1);
        pool.release(reused);
        pool.release(other);
        pool.endFrame();

        expect(reused).toBe(first);
        expect(other).not.toBe(first);
        expect(device.createTexture).toHaveBeenCalledTimes(2);
        expect(textures[0].destroy).not.toHaveBeenCalled();

        pool.destroy();
        pool.destroy();
        expect(
            textures.map((texture) => texture.destroy.mock.calls.length)
        ).toEqual([1, 1]);
    });

    test("retains the current working set and destroys unused prior sizes", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        pool.beginFrame();
        const retained = pool.acquire(100, 50, 1);
        const obsolete = pool.acquire(200, 50, 1);
        pool.release(retained);
        pool.release(obsolete);
        pool.endFrame();

        pool.beginFrame();
        expect(pool.acquire(100, 50, 1)).toBe(retained);
        pool.release(retained);
        pool.endFrame();

        expect(device.createTexture).toHaveBeenCalledTimes(2);
        expect(textures[0].destroy).not.toHaveBeenCalled();
        expect(textures[1].destroy).toHaveBeenCalledOnce();

        pool.destroy();
        expect(textures[0].destroy).toHaveBeenCalledOnce();
    });

    test("does not accumulate obsolete animation sizes", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        for (const width of [100, 101, 102]) {
            pool.beginFrame();
            pool.release(pool.acquire(width, 50, 1));
            pool.endFrame();
        }

        expect(device.createTexture).toHaveBeenCalledTimes(3);
        expect(
            textures.map((texture) => texture.destroy.mock.calls.length)
        ).toEqual([1, 1, 0]);

        pool.destroy();
        expect(
            textures.map((texture) => texture.destroy.mock.calls.length)
        ).toEqual([1, 1, 1]);
    });

    test("does not destroy a checked-out texture at a frame boundary", () => {
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        pool.beginFrame();
        pool.acquire(100, 50, 1);
        pool.endFrame();

        expect(textures[0].destroy).not.toHaveBeenCalled();
        pool.destroy();
        expect(textures[0].destroy).toHaveBeenCalledOnce();
    });

    test("releases the retained working set after an idle timeout", () => {
        vi.useFakeTimers();
        const { device, textures } = createDevice();
        const pool = new TransientTexturePool(device, "rgba8unorm");

        try {
            pool.beginFrame();
            const retained = pool.acquire(100, 50, 1);
            pool.release(retained);
            pool.endFrame();

            pool.beginFrame();
            vi.runAllTimers();
            expect(textures[0].destroy).not.toHaveBeenCalled();

            expect(pool.acquire(100, 50, 1)).toBe(retained);
            pool.release(retained);
            pool.endFrame();
            vi.runAllTimers();

            expect(textures[0].destroy).toHaveBeenCalledOnce();
            pool.destroy();
            expect(textures[0].destroy).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("TextureCompositor", () => {
    test("reuses a texture's bind group with dynamic uniform offsets", () => {
        const { device, createBindGroup, createBindGroupLayout } =
            createCompositorDevice();
        const compositor = new TextureCompositor(device, "rgba8unorm");
        const source = createTransientTexture();
        const pass = createRenderPass();

        compositor.prepare(2);
        compositor.bind(pass, source, 0.25);
        compositor.bind(pass, source, 0.75);

        expect(createBindGroupLayout).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({
                        binding: 0,
                        buffer: expect.objectContaining({
                            hasDynamicOffset: true,
                        }),
                    }),
                ]),
            })
        );
        expect(createBindGroup).toHaveBeenCalledOnce();
        expect(pass.setBindGroup).toHaveBeenNthCalledWith(
            1,
            0,
            expect.anything(),
            [0]
        );
        expect(pass.setBindGroup).toHaveBeenNthCalledWith(
            2,
            0,
            expect.anything(),
            [256]
        );

        compositor.destroy();
    });

    test("recreates cached bind groups when the uniform buffer grows", () => {
        const { device, buffers, createBindGroup } = createCompositorDevice();
        const compositor = new TextureCompositor(device, "rgba8unorm");
        const source = createTransientTexture();
        const pass = createRenderPass();

        compositor.bind(pass, source, 1);
        compositor.prepare(2);
        compositor.bind(pass, source, 1);

        expect(createBindGroup).toHaveBeenCalledTimes(2);
        expect(buffers[0].destroy).toHaveBeenCalledOnce();

        compositor.destroy();
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

function createCompositorDevice() {
    /** @type {{destroy: ReturnType<typeof vi.fn>}[]} */
    const buffers = [];
    const createBindGroup = vi.fn(() => ({}));
    const createBindGroupLayout = vi.fn(() => ({}));
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            limits: { minUniformBufferOffsetAlignment: 256 },
            createBuffer: vi.fn(() => {
                const buffer = { destroy: vi.fn() };
                buffers.push(buffer);
                return buffer;
            }),
            createBindGroup,
            createBindGroupLayout,
            createPipelineLayout: vi.fn(() => ({})),
            createShaderModule: vi.fn(() => ({})),
            createRenderPipeline: vi.fn(() => ({})),
            queue: { writeBuffer: vi.fn() },
        })
    );
    return { device, buffers, createBindGroup, createBindGroupLayout };
}

/** @returns {import("./renderGroups.js").TransientTexture} */
function createTransientTexture() {
    return /** @type {import("./renderGroups.js").TransientTexture} */ ({
        key: "texture",
        texture: {},
        view: {},
        generation: 0,
        compositeBinding: null,
    });
}

function createRenderPass() {
    return /** @type {GPURenderPassEncoder & {setBindGroup: ReturnType<typeof vi.fn>}} */ (
        /** @type {unknown} */ ({ setBindGroup: vi.fn() })
    );
}
