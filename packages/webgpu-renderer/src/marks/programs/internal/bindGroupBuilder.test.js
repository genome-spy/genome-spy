import { describe, expect, it } from "vitest";
import { buildBindGroup } from "./bindGroupBuilder.js";

describe("buildBindGroup", () => {
    it("builds ordered bindings for each resource role", () => {
        const uniformBuffer = /** @type {GPUBuffer} */ (
            /** @type {unknown} */ ({ id: "uniform" })
        );
        const seriesBuffer = /** @type {GPUBuffer} */ (
            /** @type {unknown} */ ({ id: "series" })
        );
        const ordinalRangeBuffer = /** @type {GPUBuffer} */ (
            /** @type {unknown} */ ({ id: "ordinal" })
        );
        const sampler = /** @type {GPUSampler} */ (
            /** @type {unknown} */ ({ id: "sampler" })
        );
        const textureView = /** @type {GPUTextureView} */ (
            /** @type {unknown} */ ({ id: "view" })
        );
        /** @type {GPUTextureViewDescriptor[]} */
        const textureViewDescriptors = [];
        const texture = /** @type {GPUTexture} */ (
            /** @type {unknown} */ ({
                createView: (
                    /** @type {GPUTextureViewDescriptor} */ descriptor
                ) => {
                    textureViewDescriptors.push(descriptor);
                    return textureView;
                },
            })
        );
        const layout = /** @type {GPUBindGroupLayout} */ (
            /** @type {unknown} */ ({ id: "layout" })
        );
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createBindGroup:
                    /** @type {(args: GPUBindGroupDescriptor) => GPUBindGroup} */ (
                        (args) => /** @type {unknown} */ (args)
                    ),
            })
        );

        const bindGroup = /** @type {{ entries: GPUBindGroupEntry[] }} */ (
            /** @type {unknown} */ (
                buildBindGroup({
                    device,
                    label: "root/points [point]",
                    layout,
                    uniformBuffer,
                    resourceLayout: [
                        { name: "x", role: "series" },
                        { name: "scaleTables", role: "scaleTables" },
                        { name: "x", role: "rangeTexture" },
                        { name: "x", role: "rangeSampler" },
                    ],
                    getScaleTableBuffer: () => ordinalRangeBuffer,
                    getSeriesBuffer: () => seriesBuffer,
                    getScaleResources: (name) =>
                        name === "x"
                            ? {
                                  scaleStops: undefined,
                                  rangeTexture: {
                                      texture,
                                      sampler,
                                      width: 1,
                                      height: 1,
                                      format: "rgba8unorm",
                                  },
                              }
                            : undefined,
                    extraTextures: new Map(),
                    extraBuffers: new Map(),
                })
            )
        );

        expect(bindGroup.entries.map((entry) => entry.binding)).toEqual([
            0, 1, 2, 3, 4,
        ]);
        const uniformResource = /** @type {{ buffer: GPUBuffer }} */ (
            bindGroup.entries[0].resource
        );
        const seriesResource = /** @type {{ buffer: GPUBuffer }} */ (
            bindGroup.entries[1].resource
        );
        const ordinalResource = /** @type {{ buffer: GPUBuffer }} */ (
            bindGroup.entries[2].resource
        );
        expect(uniformResource.buffer).toBe(uniformBuffer);
        expect(seriesResource.buffer).toBe(seriesBuffer);
        expect(ordinalResource.buffer).toBe(ordinalRangeBuffer);
        expect(bindGroup.entries[3].resource).toBe(textureView);
        expect(bindGroup.entries[4].resource).toBe(sampler);
        expect(
            /** @type {GPUBindGroupDescriptor} */ (
                /** @type {unknown} */ (bindGroup)
            ).label
        ).toBe("root/points [point]: bind group");
        expect(textureViewDescriptors[0].label).toBe(
            "root/points [point]: scale x range texture view"
        );
    });

    it("throws when a required series buffer is missing", () => {
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createBindGroup:
                    /** @type {(args: GPUBindGroupDescriptor) => GPUBindGroup} */ (
                        (args) => /** @type {unknown} */ (args)
                    ),
            })
        );

        expect(() =>
            buildBindGroup({
                device,
                layout: /** @type {GPUBindGroupLayout} */ (
                    /** @type {unknown} */ ({ id: "layout" })
                ),
                uniformBuffer: /** @type {GPUBuffer} */ (
                    /** @type {unknown} */ ({ id: "uniform" })
                ),
                resourceLayout: [{ name: "x", role: "series" }],
                getScaleTableBuffer: () => null,
                getSeriesBuffer: () => null,
                getScaleResources: () => undefined,
                extraTextures: new Map(),
                extraBuffers: new Map(),
            })
        ).toThrow('Missing buffer binding for "x".');
    });
});
