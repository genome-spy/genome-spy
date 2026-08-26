import { describe, expect, it, vi } from "vitest";
import { ScaleResourceManager } from "./scaleResources.js";
import { analyzeTestChannels } from "../../../../testUtils/scaleDefinitions.js";
import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
    RANGE_PREFIX,
} from "../../../wgsl/prefixes.js";

/**
 * @param {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} channels
 * @returns {{ manager: ScaleResourceManager, uniforms: Map<string, number[] | number>, buffers: Array<GPUBuffer & { destroy: ReturnType<typeof vi.fn> }>, textures: Array<GPUTexture & { destroy: ReturnType<typeof vi.fn> }> }}
 */
function createManager(channels) {
    const analysisByChannel = analyzeTestChannels(channels);
    const uniforms = new Map();
    /** @type {Array<GPUBuffer & { destroy: ReturnType<typeof vi.fn> }>} */
    const buffers = [];
    /** @type {Array<GPUTexture & { destroy: ReturnType<typeof vi.fn> }>} */
    const textures = [];
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            createBuffer:
                /** @type {(descriptor: GPUBufferDescriptor) => GPUBuffer} */ (
                    (descriptor) => {
                        const buffer =
                            /** @type {GPUBuffer & { destroy: ReturnType<typeof vi.fn> }} */ (
                                /** @type {unknown} */ ({
                                    size: descriptor.size,
                                    destroy: vi.fn(),
                                })
                            );
                        buffers.push(buffer);
                        return buffer;
                    }
                ),
            createTexture:
                /** @type {(descriptor: GPUTextureDescriptor) => GPUTexture} */ (
                    (descriptor) => {
                        const size =
                            /** @type {{ width: number, height: number } | [number, number, number?]} */ (
                                descriptor.size
                            );
                        const width = Array.isArray(size)
                            ? size[0]
                            : size.width;
                        const height = Array.isArray(size)
                            ? size[1]
                            : size.height;
                        const texture =
                            /** @type {GPUTexture & { destroy: ReturnType<typeof vi.fn> }} */ (
                                /** @type {unknown} */ ({
                                    width,
                                    height,
                                    format: descriptor.format,
                                    destroy: vi.fn(),
                                })
                            );
                        textures.push(texture);
                        return texture;
                    }
                ),
            createSampler: () => /** @type {unknown} */ ({}),
            queue: {
                writeBuffer: () => {},
                writeTexture: () => {},
            },
        })
    );
    const manager = new ScaleResourceManager({
        device,
        channels,
        analysisByChannel,
        getDefaultScaleRange: () => undefined,
        setUniformValue: (name, value) => {
            uniforms.set(name, value);
        },
    });
    return { manager, uniforms, buffers, textures };
}

describe("ScaleResourceManager", () => {
    it("updates band domains and writes domain map buffers", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: {
                    data: new Uint32Array([0, 1]),
                    type: "u32",
                    components: 1,
                    inputComponents: 1,
                    scale: {
                        type: "band",
                        domain: [10, 20, 30],
                        range: [0, 1],
                    },
                },
            });
        const { manager, uniforms } = createManager(channels);
        uniforms.set(DOMAIN_PREFIX + "x", [0, 3]);
        uniforms.set(DOMAIN_MAP_COUNT_PREFIX + "x", 0);
        manager.initializeScale("x", channels.x, channels.x.scale);
        const updater = manager.getScaleUpdater("x");

        const needsRebind = updater.updateDomain([
            10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
        ]);

        expect(needsRebind).toBe(true);
        expect(
            manager.getChannelResources("x")?.domainMap?.buffer.size
        ).toBeGreaterThan(0);
        expect(uniforms.get(DOMAIN_PREFIX + "x")).toEqual([0, 10]);
    });

    it("updates ordinal ranges and writes range buffers", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                fill: {
                    data: new Uint32Array([0]),
                    type: "u32",
                    components: 4,
                    inputComponents: 1,
                    scale: {
                        type: "ordinal",
                        domain: [0, 1],
                        range: [
                            [0, 0, 0, 1],
                            [1, 1, 1, 1],
                        ],
                    },
                },
            });
        const { manager, uniforms } = createManager(channels);
        uniforms.set(RANGE_COUNT_PREFIX + "fill", 0);
        manager.initializeScale("fill", channels.fill, channels.fill.scale);
        const updater = manager.getScaleUpdater("fill");

        const initialRebind = updater.updateRange(channels.fill.scale.range);
        const needsRebind = updater.updateRange([
            [0.1, 0.1, 0.1, 1],
            [0.2, 0.2, 0.2, 1],
        ]);

        expect(initialRebind).toBe(true);
        expect(needsRebind).toBe(false);
        expect(
            manager.getChannelResources("fill")?.ordinalRange?.buffer.size
        ).toBeGreaterThan(0);
        expect(uniforms.get(RANGE_COUNT_PREFIX + "fill")).toBe(2);
    });

    it("normalizes continuous color-texture ranges to unit coordinates", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                fill: {
                    data: new Float32Array([-1, 1]),
                    type: "f32",
                    components: 4,
                    inputComponents: 1,
                    scale: {
                        type: "linear",
                        domain: [-1, 1],
                        range: (t) => (t < 0.5 ? "purple" : "yellow"),
                    },
                },
            });
        const { manager, uniforms } = createManager(channels);

        manager.initializeScale("fill", channels.fill, channels.fill.scale);

        expect(uniforms.get(RANGE_PREFIX + "fill")).toEqual([0, 1]);
    });

    it("destroys superseded and current scale resources exactly once", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                fill: {
                    data: new Uint32Array([0]),
                    type: "u32",
                    components: 4,
                    inputComponents: 1,
                    scale: {
                        type: "ordinal",
                        domain: [0, 1],
                        range: [
                            [0, 0, 0, 1],
                            [1, 1, 1, 1],
                        ],
                    },
                },
            });
        const { manager, buffers, textures } = createManager(channels);
        manager.initializeScale("fill", channels.fill, channels.fill.scale);
        const updater = manager.getScaleUpdater("fill");

        updater.updateRange(channels.fill.scale.range);
        updater.updateRange([[0, 0, 0, 1]]);
        expect(buffers[0].destroy).toHaveBeenCalledOnce();

        manager._setDomainMapBuffer("fill", new Uint32Array([0, 0]), 1);
        manager._setDomainMapBuffer("fill", new Uint32Array([0, 0, 1, 1]), 2);
        expect(buffers[2].destroy).toHaveBeenCalledOnce();

        manager._setRangeTexture("fill", {
            width: 1,
            height: 1,
            format: "rgba8unorm",
            data: new Uint8Array(4),
        });
        manager._setRangeTexture("fill", {
            width: 2,
            height: 1,
            format: "rgba8unorm",
            data: new Uint8Array(8),
        });
        expect(textures[0].destroy).toHaveBeenCalledOnce();

        manager.destroy();
        manager.destroy();

        expect(buffers[1].destroy).toHaveBeenCalledOnce();
        expect(buffers[3].destroy).toHaveBeenCalledOnce();
        expect(textures[1].destroy).toHaveBeenCalledOnce();
    });
});
