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
        const domainMapBuffer = /** @type {GPUBuffer} */ (
            /** @type {unknown} */ ({ id: "domain" })
        );
        const sampler = /** @type {GPUSampler} */ (
            /** @type {unknown} */ ({ id: "sampler" })
        );
        const textureView = /** @type {GPUTextureView} */ (
            /** @type {unknown} */ ({ id: "view" })
        );
        const texture = /** @type {GPUTexture} */ (
            /** @type {unknown} */ ({ createView: () => textureView })
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
                    layout,
                    uniformBuffer,
                    resourceLayout: [
                        { name: "x", role: "series" },
                        { name: "x", role: "ordinalRange" },
                        { name: "x", role: "domainMap" },
                        { name: "x", role: "rangeTexture" },
                        { name: "x", role: "rangeSampler" },
                    ],
                    getSeriesBuffer: (name) =>
                        name === "x" ? seriesBuffer : null,
                    ordinalRangeBuffers: new Map([["x", ordinalRangeBuffer]]),
                    domainMapBuffers: new Map([["x", domainMapBuffer]]),
                    rangeTextures: new Map([["x", { texture, sampler }]]),
                    extraTextures: new Map(),
                    extraBuffers: new Map(),
                })
            )
        );

        expect(bindGroup.entries.map((entry) => entry.binding)).toEqual([
            0, 1, 2, 3, 4, 5,
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
        const domainResource = /** @type {{ buffer: GPUBuffer }} */ (
            bindGroup.entries[3].resource
        );

        expect(uniformResource.buffer).toBe(uniformBuffer);
        expect(seriesResource.buffer).toBe(seriesBuffer);
        expect(ordinalResource.buffer).toBe(ordinalRangeBuffer);
        expect(domainResource.buffer).toBe(domainMapBuffer);
        expect(bindGroup.entries[4].resource).toBe(textureView);
        expect(bindGroup.entries[5].resource).toBe(sampler);
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
                getSeriesBuffer: () => null,
                ordinalRangeBuffers: new Map(),
                domainMapBuffers: new Map(),
                rangeTextures: new Map(),
                extraTextures: new Map(),
                extraBuffers: new Map(),
            })
        ).toThrow('Missing buffer binding for "x".');
    });
});
