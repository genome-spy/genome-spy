import { buildMarkShader } from "../../shaders/markShaderBuilder.js";
import { gpuLabel, RENDERER_GPU_OWNER } from "../../../utils/gpuLabel.js";

/**
 * @typedef {object} PipelineBuildParams
 * @property {GPUDevice} device
 * @property {import("./programTemplateCache.js").ProgramTemplateCache} cache
 * @property {GPUBindGroupLayout} globalBindGroupLayout
 * @property {GPUTextureFormat} format
 * @property {GPUTextureFormat} pickFormat
 * @property {import("../../shaders/channelIR.js").CompiledMarkChannels} compiledChannels
 * @property {Array<{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }>} uniformLayout
 * @property {string} shaderBody
 * @property {Map<string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry>} [packedSeriesLayout]
 * @property {Array<{ name: string, type: import("../../../index.d.ts").SelectionType, targets?: Array<{ input: string, secondaryInput?: string, hitTest?: "intersects"|"encloses"|"endpoints", scalarType?: import("../../../types.js").ScalarType, secondaryScalarType?: import("../../../types.js").ScalarType }> }>} [selectionDefs]
 * @property {import("../../../index.d.ts").VisibilityPredicate} [visibleWhen]
 * @property {Record<string, import("../../../index.d.ts").ScalarSlotConfig>} [scalarSlots]
 * @property {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]} [extraResources]
 * @property {GPUPrimitiveTopology} [primitiveTopology]
 * @property {GPUBindGroupLayout} [placementBindGroupLayout]
 * @property {import("../../../index.d.ts").MarkConfig["placementIndex"]} [placementIndex]
 *
 * @typedef {object} ProgramTemplate
 * @property {GPUBindGroupLayout} bindGroupLayout
 * @property {GPURenderPipeline} pipeline
 * @property {GPURenderPipeline} pickPipeline
 *
 * @typedef {ProgramTemplate & { resourceLayout: { name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }[] }} PipelineBuildResult
 */

/**
 * @param {GPUBindGroupLayoutEntry[]} resourceBindings
 * @param {GPUTextureFormat} format
 * @param {GPUTextureFormat} pickFormat
 * @param {GPUPrimitiveTopology} primitiveTopology
 * @param {boolean} usesPlacementLayout
 * @returns {string}
 */
function createDescriptorKey(
    resourceBindings,
    format,
    pickFormat,
    primitiveTopology,
    usesPlacementLayout
) {
    return JSON.stringify([
        resourceBindings,
        format,
        pickFormat,
        primitiveTopology,
        usesPlacementLayout,
    ]);
}

/**
 * Build the shared shader resources and both render pipelines for a mark.
 *
 * @param {PipelineBuildParams} params
 * @returns {PipelineBuildResult}
 */
export function buildPipelines({
    device,
    cache,
    globalBindGroupLayout,
    format,
    pickFormat,
    compiledChannels,
    uniformLayout,
    shaderBody,
    packedSeriesLayout,
    selectionDefs,
    visibleWhen,
    scalarSlots = {},
    extraResources,
    primitiveTopology = "triangle-list",
    placementBindGroupLayout,
    placementIndex,
}) {
    const { shaderCode, resourceBindings, resourceLayout } = buildMarkShader({
        compiledChannels,
        uniformLayout,
        shaderBody,
        packedSeriesLayout,
        selectionDefs,
        visibleWhen,
        scalarSlots,
        extraResources,
        placementIndex,
    });

    const usesPlacementLayout = Boolean(
        placementIndex && placementBindGroupLayout
    );
    const descriptorKey = createDescriptorKey(
        resourceBindings,
        format,
        pickFormat,
        primitiveTopology,
        usesPlacementLayout
    );

    const template = cache.getOrCreate(shaderCode, descriptorKey, (id) => {
        const labelOwner = `${RENDERER_GPU_OWNER} program template #${id}`;
        const bindGroupLayout = device.createBindGroupLayout({
            label: gpuLabel(labelOwner, "bind group layout"),
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                ...resourceBindings,
            ],
        });

        const module = device.createShaderModule({
            label: gpuLabel(labelOwner, "shader"),
            code: shaderCode,
        });
        // Match WebGL helper behavior: premultiplied alpha blending.
        /** @type {GPUBlendState} */
        const blendState = {
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
        };
        const pipelineLayout = device.createPipelineLayout({
            label: gpuLabel(labelOwner, "pipeline layout"),
            bindGroupLayouts: [
                globalBindGroupLayout,
                bindGroupLayout,
                ...(usesPlacementLayout ? [placementBindGroupLayout] : []),
            ],
        });
        const common = {
            layout: pipelineLayout,
            vertex: {
                module,
                entryPoint: "vs_main",
            },
            primitive: {
                topology: primitiveTopology,
            },
        };
        const pipeline = device.createRenderPipeline({
            label: gpuLabel(labelOwner, "render pipeline"),
            ...common,
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [
                    {
                        format,
                        blend: blendState,
                    },
                ],
            },
        });
        const pickPipeline = device.createRenderPipeline({
            label: gpuLabel(labelOwner, "picking pipeline"),
            ...common,
            fragment: {
                module,
                entryPoint: "fs_pick",
                targets: [
                    {
                        format: pickFormat,
                    },
                ],
            },
        });
        return { bindGroupLayout, pipeline, pickPipeline };
    });
    const immutableResourceLayout = resourceLayout.map((entry) =>
        Object.freeze({ ...entry })
    );
    Object.freeze(immutableResourceLayout);

    return { ...template, resourceLayout: immutableResourceLayout };
}
