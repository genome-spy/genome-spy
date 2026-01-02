import { buildMarkShader } from "../shaders/markShaderBuilder.js";

/**
 * @typedef {object} PipelineBuildParams
 * @property {GPUDevice} device
 * @property {GPUBindGroupLayout} globalBindGroupLayout
 * @property {GPUTextureFormat} format
 * @property {Record<string, import("../../index.d.ts").ChannelConfigResolved>} channels
 * @property {Array<{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }>} uniformLayout
 * @property {string} shaderBody
 * @property {Map<string, string>} seriesBufferAliases
 * @property {Map<string, import("../programs/packedSeriesLayout.js").PackedSeriesLayoutEntry>} [packedSeriesLayout]
 * @property {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]} [extraResources]
 *
 * @typedef {object} PipelineBuildResult
 * @property {GPUBindGroupLayout} bindGroupLayout
 * @property {GPURenderPipeline} pipeline
 * @property {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler" }[]} resourceLayout
 */

/**
 * Build shader modules and a render pipeline for a mark.
 *
 * @param {PipelineBuildParams} params
 * @returns {PipelineBuildResult}
 */
export function buildPipeline({
    device,
    globalBindGroupLayout,
    format,
    channels,
    uniformLayout,
    shaderBody,
    seriesBufferAliases,
    packedSeriesLayout,
    extraResources,
}) {
    const { shaderCode, resourceBindings, resourceLayout } = buildMarkShader({
        channels,
        uniformLayout,
        shaderBody,
        seriesBufferAliases,
        packedSeriesLayout,
        extraResources,
    });

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                // eslint-disable-next-line no-undef
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            },
            ...resourceBindings,
        ],
    });

    const module = device.createShaderModule({ code: shaderCode });
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
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [globalBindGroupLayout, bindGroupLayout],
        }),
        vertex: {
            module,
            entryPoint: "vs_main",
        },
        fragment: {
            module,
            entryPoint: "fs_main",
            targets: [{ format, blend: blendState }],
        },
        primitive: { topology: "triangle-list" },
    });

    return { bindGroupLayout, pipeline, resourceLayout };
}
