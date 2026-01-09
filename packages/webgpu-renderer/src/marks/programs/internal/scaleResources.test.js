import { describe, expect, it } from "vitest";
import { ScaleResourceManager } from "./scaleResources.js";
import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
} from "../../../wgsl/prefixes.js";

/**
 * @param {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} channels
 * @returns {{ manager: ScaleResourceManager, uniforms: Map<string, number[] | number> }}
 */
function createManager(channels) {
    const uniforms = new Map();
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            createBuffer:
                /** @type {(descriptor: GPUBufferDescriptor) => GPUBuffer} */ (
                    (descriptor) =>
                        /** @type {unknown} */ ({ size: descriptor.size })
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
                        return /** @type {unknown} */ ({
                            width,
                            height,
                            format: descriptor.format,
                        });
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
        getDefaultScaleRange: () => undefined,
        setUniformValue: (name, value) => {
            uniforms.set(name, value);
        },
    });
    return { manager, uniforms };
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
        expect(manager.domainMapBuffers.get("x")?.size).toBeGreaterThan(0);
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
        expect(manager.ordinalRangeBuffers.get("fill")?.size).toBeGreaterThan(
            0
        );
        expect(uniforms.get(RANGE_COUNT_PREFIX + "fill")).toBe(2);
    });
});
