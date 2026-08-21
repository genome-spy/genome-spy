import { buildMarkShader } from "../../shaders/markShaderBuilder.js";

/**
 * @typedef {object} PipelineBuildParams
 * @property {GPUDevice} device
 * @property {GPUBindGroupLayout} globalBindGroupLayout
 * @property {GPUTextureFormat} format
 * @property {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} channels
 * @property {Array<{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }>} uniformLayout
 * @property {string} shaderBody
 * @property {Map<string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry>} [packedSeriesLayout]
 * @property {Array<{ name: string, type: import("../../../index.d.ts").SelectionType, targets?: Array<{ input: string, secondaryInput?: string, hitTest?: "intersects"|"encloses"|"endpoints", scalarType?: import("../../../types.js").ScalarType, secondaryScalarType?: import("../../../types.js").ScalarType }> }>} [selectionDefs]
 * @property {import("../../../index.d.ts").VisibilityPredicate} [visibleWhen]
 * @property {Record<string, import("../../../index.d.ts").ScalarSlotConfig>} [scalarSlots]
 * @property {Set<string>} [channelNames]
 * @property {Set<string>} [inputNames]
 * @property {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]} [extraResources]
 * @property {GPUPrimitiveTopology} [primitiveTopology]
 * @property {string} [fragmentEntry]
 * @property {boolean} [enableBlend]
 *
 * @typedef {object} PipelineBuildResult
 * @property {GPUBindGroupLayout} bindGroupLayout
 * @property {GPURenderPipeline} pipeline
 * @property {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }[]} resourceLayout
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
    packedSeriesLayout,
    selectionDefs,
    visibleWhen,
    scalarSlots = {},
    channelNames,
    inputNames,
    extraResources,
    primitiveTopology = "triangle-list",
    fragmentEntry = "fs_main",
    enableBlend = true,
}) {
    const { shaderCode, resourceBindings, resourceLayout } = buildMarkShader({
        channels,
        uniformLayout,
        shaderBody,
        packedSeriesLayout,
        selectionDefs,
        visibleWhen,
        scalarSlots,
        channelNames,
        inputNames,
        extraResources,
    });

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
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
            entryPoint: fragmentEntry,
            targets: [
                {
                    format,
                    blend: enableBlend ? blendState : undefined,
                },
            ],
        },
        primitive: {
            topology: primitiveTopology,
        },
    });

    return { bindGroupLayout, pipeline, resourceLayout };
}
