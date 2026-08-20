import { describe, expect, it, vi } from "vitest";
import { SeriesBufferManager } from "./seriesBuffers.js";

/**
 * @param {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} channels
 * @param {GPUDevice} [device]
 * @returns {SeriesBufferManager}
 */
function createManager(
    channels,
    device = /** @type {GPUDevice} */ (/** @type {unknown} */ ({}))
) {
    return new SeriesBufferManager(device, channels, {});
}

describe("SeriesBufferManager.inferCount", () => {
    it("infers count from input components", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: {
                    data: new Float32Array(6),
                    type: "f32",
                    components: 2,
                    inputComponents: 2,
                },
            });
        const manager = createManager(channels);

        expect(manager.inferCount()).toBe(3);
    });

    it("throws when series counts mismatch", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: {
                    data: new Float32Array(2),
                    type: "f32",
                    components: 1,
                    inputComponents: 1,
                },
                y: {
                    data: new Float32Array(3),
                    type: "f32",
                    components: 1,
                    inputComponents: 1,
                },
            });
        const manager = createManager(channels);

        expect(() => manager.inferCount()).toThrow(
            'Channel "y" count (3) does not match inferred count (2).'
        );
    });

    it("infers count from Float64 index series", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: {
                    data: new Float64Array(5),
                    type: "u32",
                    components: 1,
                    inputComponents: 2,
                    scale: { type: "index" },
                },
            });
        const manager = createManager(channels);

        expect(manager.inferCount()).toBe(5);
    });

    it("returns null when there are no series channels", () => {
        const channels =
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                y: {
                    value: 1,
                    type: "f32",
                    components: 1,
                },
            });
        const manager = createManager(channels);

        expect(manager.inferCount()).toBeNull();
    });
});

describe("SeriesBufferManager uploads", () => {
    it("uses a non-empty backing buffer for an empty series", () => {
        const { device, createBuffer, writeBuffer } = createDevice();
        const data = new Float32Array(0);
        const manager = createManager(
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: { data, type: "f32", components: 1 },
            }),
            device
        );

        manager.updateSeries({ x: data }, 0);

        expect(createBuffer).toHaveBeenCalledWith(
            expect.objectContaining({ size: 4 })
        );
        expect(writeBuffer).not.toHaveBeenCalled();
    });

    it("destroys a superseded buffer when a series grows", () => {
        const { device, buffers } = createDevice();
        const initial = new Float32Array([1]);
        const manager = createManager(
            /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ ({
                x: { data: initial, type: "f32", components: 1 },
            }),
            device
        );

        manager.updateSeries({ x: initial }, 1);
        const previous = buffers[0];
        manager.updateSeries({ x: new Float32Array([1, 2]) }, 2);

        expect(previous.destroy).toHaveBeenCalledOnce();
        expect(buffers[1].size).toBe(8);
    });
});

function createDevice() {
    /** @type {Array<{ size: number, destroy: ReturnType<typeof vi.fn> }>} */
    const buffers = [];
    const createBuffer = vi.fn(({ size }) => {
        const buffer = { size, destroy: vi.fn() };
        buffers.push(buffer);
        return buffer;
    });
    const writeBuffer = vi.fn();
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            createBuffer,
            queue: { writeBuffer },
        })
    );
    return { device, buffers, createBuffer, writeBuffer };
}
