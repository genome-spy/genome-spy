import { mockGpuLimits } from "../../../testUtils/mockRenderer.js";
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
 * @param {Partial<typeof mockGpuLimits>} [limits]
 * @returns {{ manager: ScaleResourceManager, uniforms: Map<string, number[] | number>, buffers: Array<GPUBuffer & { destroy: ReturnType<typeof vi.fn> }>, textures: Array<GPUTexture & { destroy: ReturnType<typeof vi.fn> }>, writes: ReturnType<typeof vi.fn> }}
 */
function createManager(channels, limits = {}) {
    const analysisByChannel = analyzeTestChannels(channels);
    const uniforms = new Map();
    /** @type {Array<GPUBuffer & { destroy: ReturnType<typeof vi.fn> }>} */
    const buffers = [];
    /** @type {Array<GPUTexture & { destroy: ReturnType<typeof vi.fn> }>} */
    const textures = [];
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            limits: { ...mockGpuLimits, ...limits },
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
                writeBuffer: vi.fn(),
                writeTexture: () => {},
            },
        })
    );
    const manager = new ScaleResourceManager({
        device,
        analysisByChannel,
        getDefaultScaleRange: () => undefined,
        setUniformValue: (name, value) => {
            uniforms.set(name, value);
        },
    });
    return {
        manager,
        uniforms,
        buffers,
        textures,
        writes: vi.mocked(device.queue.writeBuffer),
    };
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

        // Domain publication follows initialization; [] publishes empty membership.
        expect(uniforms.get(DOMAIN_MAP_COUNT_PREFIX + "x")).toBe(-1);
        updater.updateDomain([]);
        expect(uniforms.get(DOMAIN_MAP_COUNT_PREFIX + "x")).toBe(0);
        expect(uniforms.get(DOMAIN_PREFIX + "x")).toEqual([0, 0]);

        const needsRebind = updater.updateDomain([
            10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
        ]);

        expect(needsRebind).toBe(true);
        expect(manager.tableBuffer?.size).toBeGreaterThan(0);
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
        expect(manager.tableBuffer?.size).toBeGreaterThan(0);
        expect(uniforms.get(RANGE_COUNT_PREFIX + "fill")).toBe(2);
    });

    it("relocates independent scale slices on growth and uploads only the changed slice otherwise", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: {
                    data: new Uint32Array([10]),
                    type: "u32",
                    components: 1,
                    scale: { type: "band", domain: [10, 42], range: [0, 100] },
                },
                y: {
                    data: new Uint32Array([7]),
                    type: "u32",
                    components: 1,
                    scale: { type: "band", domain: [7, 99], range: [0, 100] },
                },
            });
        const { manager, uniforms, writes } = createManager(channels);
        for (const [name, channel] of Object.entries(channels)) {
            manager.initializeScale(name, channel, channel.scale);
            manager.getScaleUpdater(name).updateDomain(channel.scale.domain);
        }
        const initial = manager.tableBuffer;
        const oldY = uniforms.get("uDomainMapTable_y");
        writes.mockClear();
        expect(manager.getScaleUpdater("x").updateDomain([10, 43])).toBe(false);
        expect(manager.tableBuffer).toBe(initial);
        expect(writes).toHaveBeenCalledOnce();
        expect(uniforms.get("uDomainMapTable_y")).toEqual(oldY);

        writes.mockClear();
        expect(
            manager
                .getScaleUpdater("x")
                .updateDomain(Array.from({ length: 100 }, (_, i) => i))
        ).toBe(true);
        expect(manager.tableBuffer).not.toBe(initial);
        expect(writes).toHaveBeenCalledTimes(2);
        const y = /** @type {number[]} */ (uniforms.get("uDomainMapTable_y"));
        expect(y[0]).toBeGreaterThan(/** @type {number[]} */ (oldY)[0]);
        expect(writes.mock.calls[1][1]).toBe(y[0] * 4);
        // The untouched sparse domain is retained and uploaded at its new offset.
        expect(Array.from(writes.mock.calls[1][2])).toContain(99);
        manager.destroy();
    });

    it("releases spare slice capacity before rejecting growth at the byte limit", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ (
                Object.fromEntries(
                    ["x", "y"].map((name) => [
                        name,
                        {
                            data: new Uint32Array([0]),
                            type: "u32",
                            components: 1,
                            inputComponents: 1,
                            scale: { type: "ordinal", domain: [0], range: [0] },
                        },
                    ])
                )
            );
        const { manager, uniforms, buffers, writes } = createManager(channels, {
            maxStorageBufferBindingSize: 32,
        });
        for (const name of ["x", "y"])
            manager.initializeScale(name, channels[name], channels[name].scale);
        const x = manager.getScaleUpdater("x");
        const y = manager.getScaleUpdater("y");
        x.updateRange(Array(7).fill(0));
        y.updateRange([0]);
        const retained = manager.tableBuffer;
        x.updateRange([0]);
        expect(manager.tableBuffer).toBe(retained);
        // The payload fits after reclaiming x's six unused words.
        y.updateRange(Array(7).fill(0));
        expect(manager.tableBuffer.size).toBe(32);
        expect(uniforms.get("uRangeTable_y")).toBe(1);
        const allocations = buffers.length;
        writes.mockClear();
        expect(() => y.updateRange(Array(8).fill(0))).toThrow(
            "requires 36 bytes"
        );
        expect(buffers).toHaveLength(allocations);
        expect(writes).not.toHaveBeenCalled();
        manager.destroy();
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
        const { manager, uniforms, textures } = createManager(channels);

        manager.initializeScale("fill", channels.fill, channels.fill.scale);
        manager.getScaleUpdater("fill").updateRange(["red", "blue"]);
        expect(textures).toHaveLength(1);
        expect(uniforms.get(RANGE_PREFIX + "fill")).toEqual([0, 1]);
        manager.destroy();
        manager.destroy();
        expect(textures[0].destroy).toHaveBeenCalledOnce();
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
        const { manager, buffers } = createManager(channels);
        manager.initializeScale("fill", channels.fill, channels.fill.scale);
        const updater = manager.getScaleUpdater("fill");

        updater.updateRange(channels.fill.scale.range);
        updater.updateRange([[0, 0, 0, 1]]);
        const retainedBuffer = manager.tableBuffer;
        updater.updateRange(channels.fill.scale.range);
        expect(manager.tableBuffer).toBe(retainedBuffer);

        updater.updateDomain([0]);
        updater.updateDomain(Array.from({ length: 20 }, (_, i) => i));
        manager.destroy();
        manager.destroy();

        for (const buffer of buffers)
            expect(buffer.destroy).toHaveBeenCalledOnce();
    });
});

describe("grouping gap resources", () => {
    it.each([
        { gapPositions: [10], gapWidth: 0 },
        { gapPositions: [10], gapWidth: null },
        { gapPositions: [], gapWidth: 6 },
        { gapPositions: null, gapWidth: 6 },
    ])("allocates nothing for static disablement: %j", (gaps) => {
        const channel = {
            type: /** @type {const} */ ("u32"),
            data: new Uint32Array([0]),
            components: /** @type {const} */ (1),
            inputComponents: /** @type {const} */ (1),
            scale: { type: "index", domain: [0, 20], range: [0, 100], ...gaps },
        };
        const { manager, buffers, textures, uniforms } = createManager({
            x: channel,
        });
        manager.initializeScale("x", channel, channel.scale);
        expect(buffers).toHaveLength(0);
        expect(textures).toHaveLength(0);
        expect(
            Array.from(uniforms.keys()).some((name) => name.startsWith("gap"))
        ).toBe(false);
        manager.destroy();
    });

    it("shares cut tables, retains them during navigation, and destroys owned buffers", () => {
        const channel = {
            type: /** @type {const} */ ("u32"),
            data: new Uint32Array([0]),
            components: /** @type {const} */ (1),
            inputComponents: /** @type {const} */ (1),
            scale: {
                type: "index",
                domain: [0, 20],
                range: [0, 100],
                gapPositions: [10],
                gapWidth: 6,
            },
        };
        const { manager, buffers, uniforms } = createManager({
            x: channel,
            x2: channel,
        });
        manager.initializeScale("x", channel, channel.scale);
        manager.initializeScale("x2", channel, channel.scale);
        expect(buffers).toHaveLength(1);
        expect(uniforms.get("gapTable_x")).toEqual(uniforms.get("gapTable_x2"));
        manager.getScaleUpdater("x").updateDomain([5, 15]);
        manager.updateGapWidth("x", 12);
        expect(buffers).toHaveLength(1);
        manager.updateGapPositions("x", [10, 12]);
        expect(buffers[0].destroy).toHaveBeenCalledOnce();
        expect(buffers).toHaveLength(2);
        manager.destroy();
        expect(buffers[1].destroy).toHaveBeenCalledOnce();
    });

    it("updates domains and fractional ranks together without replacing cuts", () => {
        const channel = {
            type: /** @type {const} */ ("u32"),
            data: new Uint32Array([0]),
            components: /** @type {const} */ (1),
            inputComponents: /** @type {const} */ (1),
            scale: {
                type: "index",
                domain: [0, 20],
                range: [0, 100],
                gapPositions: [10],
                gapWidth: 6,
            },
        };
        const { manager, uniforms, buffers } = createManager({ x: channel });
        manager.initializeScale("x", channel, channel.scale);
        const updater = manager.getScaleUpdater("x");
        updater.updateDomain([10, 20], [0.5, 1]);
        expect(uniforms.get("gapGeometry_x")).toEqual([6, 0.5, 1, 1]);

        // Cut updates retain explicit ranks, matching Core's scale setters.
        manager.updateGapPositions("x", [5, 10]);
        expect(uniforms.get("gapGeometry_x")).toEqual([6, 0.5, 1, 1]);
        updater.updateDomain([10, 20]);
        expect(uniforms.get("gapGeometry_x")).toEqual([6, 2, 2, 0]);
        expect(buffers).toHaveLength(2);
        manager.destroy();
    });
});
