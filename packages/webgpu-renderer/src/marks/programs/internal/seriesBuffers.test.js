import { describe, expect, it } from "vitest";
import { SeriesBufferManager } from "./seriesBuffers.js";

/**
 * @param {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} channels
 * @returns {SeriesBufferManager}
 */
function createManager(channels) {
    const device = /** @type {GPUDevice} */ (/** @type {unknown} */ ({}));
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
