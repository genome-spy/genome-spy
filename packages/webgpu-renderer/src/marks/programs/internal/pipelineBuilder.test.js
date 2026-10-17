import { mockGpuLimits } from "../../../testUtils/mockRenderer.js";
import { describe, expect, it } from "vitest";
import { buildPipelines } from "./pipelineBuilder.js";
import { ProgramTemplateCache } from "./programTemplateCache.js";
import { compileTestMarkChannels } from "../../../../testUtils/scaleDefinitions.js";

function createHarness() {
    /** @type {GPURenderPipelineDescriptor[]} */
    const renderPipelineArgs = [];
    /** @type {GPUBindGroupLayoutDescriptor[]} */
    const bindGroupLayoutArgs = [];
    /** @type {GPUPipelineLayoutDescriptor[]} */
    const pipelineLayoutArgs = [];
    /** @type {GPUShaderModuleDescriptor[]} */
    const shaderModuleArgs = [];
    /** @type {string[]} */
    const cacheCounts = [];

    let nextObjectId = 1;
    const gpuObject = () => ({ id: nextObjectId++ });
    const device = /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            limits: mockGpuLimits,
            createBindGroupLayout:
                /** @type {(args: GPUBindGroupLayoutDescriptor) => GPUBindGroupLayout} */ (
                    (args) => {
                        bindGroupLayoutArgs.push(args);
                        return /** @type {GPUBindGroupLayout} */ (
                            /** @type {unknown} */ (gpuObject())
                        );
                    }
                ),
            createPipelineLayout:
                /** @type {(args: GPUPipelineLayoutDescriptor) => GPUPipelineLayout} */ (
                    (args) => {
                        pipelineLayoutArgs.push(args);
                        return /** @type {GPUPipelineLayout} */ (
                            /** @type {unknown} */ ({
                                ...gpuObject(),
                                bindGroupLayouts: args.bindGroupLayouts,
                            })
                        );
                    }
                ),
            createShaderModule:
                /** @type {(args: GPUShaderModuleDescriptor) => GPUShaderModule} */ (
                    (args) => {
                        shaderModuleArgs.push(args);
                        return /** @type {GPUShaderModule} */ (
                            /** @type {unknown} */ (gpuObject())
                        );
                    }
                ),
            createRenderPipeline:
                /** @type {(args: GPURenderPipelineDescriptor) => GPURenderPipeline} */ (
                    (args) => {
                        renderPipelineArgs.push(args);
                        return /** @type {GPURenderPipeline} */ (
                            /** @type {unknown} */ (gpuObject())
                        );
                    }
                ),
        })
    );
    const globalBindGroupLayout = /** @type {GPUBindGroupLayout} */ (
        /** @type {unknown} */ (gpuObject())
    );
    const placementBindGroupLayout = /** @type {GPUBindGroupLayout} */ (
        /** @type {unknown} */ (gpuObject())
    );
    const cache = new ProgramTemplateCache((name) => cacheCounts.push(name));
    const baseParams = /** @type {Parameters<typeof buildPipelines>[0]} */ ({
        device,
        cache,
        globalBindGroupLayout,
        format: "rgba8unorm",
        pickFormat: "rgba8unorm",
        compiledChannels: compileTestMarkChannels({
            x: {
                data: new Float32Array([0]),
                type: "f32",
                components: 1,
                inputComponents: 1,
            },
        }),
        uniformLayout: [{ name: "dummy", type: "f32", components: 1 }],
        shaderBody: "",
        packedSeriesLayout: new Map([
            [
                "x",
                {
                    name: "x",
                    scalarType: "f32",
                    components: 1,
                    offset: 0,
                    stride: 1,
                },
            ],
        ]),
        placementBindGroupLayout,
        label: "first mark",
    });

    return {
        /** @param {Partial<Parameters<typeof buildPipelines>[0]>} [overrides] */
        build(overrides = {}) {
            return buildPipelines({ ...baseParams, ...overrides });
        },
        globalBindGroupLayout,
        bindGroupLayoutArgs,
        pipelineLayoutArgs,
        shaderModuleArgs,
        renderPipelineArgs,
        cacheCounts,
    };
}

describe("buildPipelines", () => {
    it("budgets independent selection tables together with text resources and placement before GPU creation", () => {
        const harness = createHarness();
        const compiledChannels = compileTestMarkChannels({
            x: { data: new Float32Array([0]), type: "f32", components: 1 },
            uniqueId: { value: 17, type: "u32", components: 1 },
        });
        const extraResources = [
            "scaleTables",
            "glyphs",
            "stringMetrics",
            "glyphMetrics",
            "renderItems",
        ].map((name) => ({
            name,
            kind: /** @type {const} */ ("buffer"),
            role: /** @type {const} */ ("extraBuffer"),
            wgslType: "array<u32>",
            visibility: /** @type {const} */ ("vertex"),
        }));
        const build = (/** @type {string[]} */ names) =>
            harness.build({
                compiledChannels,
                extraResources: [
                    ...extraResources,
                    ...names.map((name) => ({
                        name: "selection_" + name,
                        kind: /** @type {const} */ ("buffer"),
                        role: /** @type {const} */ ("extraBuffer"),
                        wgslType: "array<HashEntry>",
                        visibility: /** @type {const} */ ("vertex"),
                    })),
                ],
                placementIndex: { source: "draw" },
                selectionDefs: names.map((name) => ({ name, type: "multi" })),
                uniformLayout: names.map((name) => ({
                    name: "uSelectionCount_" + name,
                    type: "f32",
                    components: 1,
                })),
            });
        build(["picked"]); // series + scale + four text buffers + placement + selection = 8
        expect(() => build(["picked", "brush"])).toThrow(
            /first mark vertex.*9.*maxStorageBuffersPerShaderStage.*8.*selection_picked.*selection_brush/
        );
        expect(harness.bindGroupLayoutArgs).toHaveLength(1);
        expect(harness.shaderModuleArgs).toHaveLength(1);
    });

    it("shares equivalent program templates", () => {
        const harness = createHarness();

        const first = harness.build();
        const second = harness.build({ label: "second mark" });

        expect(second.getPipeline(1)).toBe(first.getPipeline(1));
        expect(second.getPickPipeline).toBe(first.getPickPipeline);
        expect(second.bindGroupLayout).toBe(first.bindGroupLayout);
        expect(first.diagnostics).toBe(second.diagnostics);
        expect(first.diagnostics).toEqual({
            id: 1,
            firstBorrowerLabel: "first mark",
            borrowerLabels: new Set(["first mark", "second mark"]),
        });
        expect(first.resourceLayout).toEqual([
            { name: "series", role: "series" },
        ]);
        expect(Object.isFrozen(first.resourceLayout)).toBe(true);
        expect(Object.isFrozen(first.resourceLayout[0])).toBe(true);
        expect(harness.bindGroupLayoutArgs).toHaveLength(1);
        expect(harness.pipelineLayoutArgs).toHaveLength(1);
        expect(harness.shaderModuleArgs).toHaveLength(1);
        expect(harness.renderPipelineArgs).toHaveLength(1);
        const pickPipeline = first.getPickPipeline();
        expect(second.getPickPipeline()).toBe(pickPipeline);
        expect(harness.renderPipelineArgs).toHaveLength(2);
        expect(harness.cacheCounts).toEqual([
            "programTemplateCacheMisses",
            "programTemplateCacheHits",
        ]);
    });

    it("builds visible and picking pipelines from shared resources", () => {
        const harness = createHarness();

        const template = harness.build();
        template.getPipeline(1);
        const pickPipeline = template.getPickPipeline();

        const pipelineArgs = harness.renderPipelineArgs[0];
        const pickPipelineArgs = harness.renderPipelineArgs[1];
        const targets = Array.from(pipelineArgs.fragment.targets ?? []);
        const layout =
            /** @type {{ bindGroupLayouts: GPUBindGroupLayout[] }} */ (
                /** @type {unknown} */ (pipelineArgs.layout)
            );

        expect(targets[0]?.format).toBe("rgba8unorm");
        expect(targets[0]?.blend).toEqual({
            color: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
            },
            alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
            },
        });
        expect(layout.bindGroupLayouts[0]).toBe(harness.globalBindGroupLayout);
        expect(pickPipelineArgs.fragment.entryPoint).toBe("fs_pick");
        expect(pickPipelineArgs.vertex.constants).toBeUndefined();
        expect(pickPipelineArgs.fragment.constants).toBeUndefined();
        expect(pickPipelineArgs.layout).toBe(pipelineArgs.layout);
        expect(pickPipelineArgs.vertex.module).toBe(pipelineArgs.vertex.module);
        expect(template.getPickPipeline()).toBe(pickPipeline);
        expect(harness.renderPipelineArgs).toHaveLength(2);
        expect(harness.bindGroupLayoutArgs[0].label).toBe(
            "webgpu-renderer program template #1 (first used by first mark): bind group layout"
        );
        expect(harness.shaderModuleArgs[0].label).toBe(
            "webgpu-renderer program template #1 (first used by first mark): shader"
        );
        expect(harness.pipelineLayoutArgs[0].label).toBe(
            "webgpu-renderer program template #1 (first used by first mark): pipeline layout"
        );
        expect(pipelineArgs.label).toBe(
            "webgpu-renderer program template #1 (first used by first mark): render pipeline"
        );
        expect(pickPipelineArgs.label).toBe(
            "webgpu-renderer program template #1 (first used by first mark): picking pipeline"
        );
    });

    it("creates and shares the four-sample visible pipeline lazily", () => {
        const harness = createHarness();

        const first = harness.build();
        const second = harness.build({ label: "second mark" });
        expect(harness.renderPipelineArgs).toHaveLength(0);

        const multisampled = first.getPipeline(4);

        expect(second.getPipeline(4)).toBe(multisampled);
        expect(harness.renderPipelineArgs).toHaveLength(1);
        expect(harness.renderPipelineArgs[0].multisample).toEqual({ count: 4 });
        expect(harness.renderPipelineArgs[0].label).toBe(
            "webgpu-renderer program template #1 (first used by first mark): 4x render pipeline"
        );
    });

    it("sets pickingEnabled for shaders that use the override", () => {
        const harness = createHarness();
        const template = harness.build({ usesPickingEnabledOverride: true });
        template.getPickPipeline();

        expect(harness.renderPipelineArgs[0].vertex.constants).toEqual({
            pickingEnabled: 1,
        });
        expect(harness.renderPipelineArgs[0].fragment.constants).toEqual({
            pickingEnabled: 1,
        });
    });

    it.each([
        ["WGSL", { shaderBody: "let cacheMiss = 1.0;" }],
        ["render format", { format: "bgra8unorm" }],
        ["picking format", { pickFormat: "r32uint" }],
        ["topology", { primitiveTopology: "line-list" }],
        ["pickingEnabled override", { usesPickingEnabledOverride: true }],
        ["placement layout", { placementIndex: { source: "draw" } }],
    ])("does not share when %s differs", (_name, overrides) => {
        const harness = createHarness();

        const first = harness.build();
        const second = harness.build(
            /** @type {Partial<Parameters<typeof buildPipelines>[0]>} */ (
                overrides
            )
        );

        expect(second.getPipeline(1)).not.toBe(first.getPipeline(1));
        expect(harness.shaderModuleArgs).toHaveLength(2);
        expect(harness.renderPipelineArgs).toHaveLength(2);
    });

    it("does not share when only bind-group visibility differs", () => {
        const harness = createHarness();
        const extraResource = {
            name: "lookup",
            kind: /** @type {const} */ ("buffer"),
            role: /** @type {const} */ ("extraBuffer"),
        };

        harness.build({
            extraResources: [{ ...extraResource, visibility: "vertex" }],
        });
        harness.build({
            extraResources: [{ ...extraResource, visibility: "all" }],
        });

        expect(harness.shaderModuleArgs).toHaveLength(2);
        expect(harness.shaderModuleArgs[0].code).toBe(
            harness.shaderModuleArgs[1].code
        );
        const firstEntries = Array.from(harness.bindGroupLayoutArgs[0].entries);
        const secondEntries = Array.from(
            harness.bindGroupLayoutArgs[1].entries
        );
        expect(firstEntries.at(-1)?.visibility).not.toBe(
            secondEntries.at(-1)?.visibility
        );
    });

    it("keeps host resource names per mark", () => {
        const harness = createHarness();
        const extraResource = {
            kind: /** @type {const} */ ("buffer"),
            role: /** @type {const} */ ("extraBuffer"),
            wgslName: "lookup",
        };

        const first = harness.build({
            extraResources: [{ ...extraResource, name: "firstLookup" }],
        });
        const second = harness.build({
            extraResources: [{ ...extraResource, name: "secondLookup" }],
        });

        expect(second.getPipeline(1)).toBe(first.getPipeline(1));
        expect(first.resourceLayout.at(-1)?.name).toBe("firstLookup");
        expect(second.resourceLayout.at(-1)?.name).toBe("secondLookup");
    });
});
