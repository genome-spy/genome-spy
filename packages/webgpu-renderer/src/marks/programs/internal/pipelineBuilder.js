import {
    globalBindings,
    placementBindings,
    validateBindingCounts,
} from "../../../utils/bindingLimits.js";
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
 * @property {boolean} [usesPickingEnabledOverride] Whether the mark shader uses the pickingEnabled WGSL override.
 * @property {Map<string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry>} [packedSeriesLayout]
 * @property {Array<{ name: string, type: import("../../../index.d.ts").SelectionType, targets?: Array<{ input: string, secondaryInput?: string, hitTest?: "intersects"|"encloses"|"endpoints", scalarType?: import("../../../types.js").ScalarType, secondaryScalarType?: import("../../../types.js").ScalarType }> }>} [selectionDefs]
 * @property {import("../../../index.d.ts").VisibilityPredicate} [visibleWhen]
 * @property {import("../../../index.d.ts").MarkOrder} [order]
 * @property {Record<string, import("../../../index.d.ts").ScalarSlotConfig>} [scalarSlots]
 * @property {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]} [extraResources]
 * @property {GPUPrimitiveTopology} [primitiveTopology]
 * @property {GPUBindGroupLayout} [placementBindGroupLayout]
 * @property {import("../../../index.d.ts").MarkConfig["placementIndex"]} [placementIndex]
 * @property {string} label
 *
 * @typedef {object} ProgramTemplate
 * @property {GPUBindGroupLayout} bindGroupLayout
 * @property {(sampleCount: 1 | 4) => GPURenderPipeline} getPipeline
 * @property {() => GPURenderPipeline} getPickPipeline
 * @property {{ id: number, firstBorrowerLabel: string, borrowerLabels: Set<string> }} diagnostics
 *
 * @typedef {ProgramTemplate & { resourceLayout: { name: string, role: "series"|"scaleTables"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }[] }} PipelineBuildResult
 */

/**
 * @param {GPUBindGroupLayoutEntry[]} resourceBindings
 * @param {GPUTextureFormat} format
 * @param {GPUTextureFormat} pickFormat
 * @param {GPUPrimitiveTopology} primitiveTopology
 * @param {boolean} usesPlacementLayout
 * @param {boolean} usesPickingEnabledOverride
 * @returns {string}
 */
function createDescriptorKey(
    resourceBindings,
    format,
    pickFormat,
    primitiveTopology,
    usesPlacementLayout,
    usesPickingEnabledOverride
) {
    return JSON.stringify([
        resourceBindings,
        format,
        pickFormat,
        primitiveTopology,
        usesPlacementLayout,
        usesPickingEnabledOverride,
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
    usesPickingEnabledOverride = false,
    packedSeriesLayout,
    selectionDefs,
    visibleWhen,
    order,
    scalarSlots = {},
    extraResources,
    primitiveTopology = "triangle-list",
    placementBindGroupLayout,
    placementIndex,
    label,
}) {
    const { shaderCode, resourceBindings, resourceLayout } = buildMarkShader({
        compiledChannels,
        uniformLayout,
        shaderBody,
        packedSeriesLayout,
        selectionDefs,
        visibleWhen,
        order,
        scalarSlots,
        extraResources,
        placementIndex,
    });

    const usesPlacementLayout = Boolean(
        placementIndex && placementBindGroupLayout
    );
    const markBindings = [
        {
            entry: {
                binding: 0,
                visibility: 3,
                buffer: { type: /** @type {const} */ ("uniform") },
            },
            name: "mark uniforms",
        },
        ...resourceBindings.map((entry, index) => ({
            entry,
            name: resourceLayout[index].role + " " + resourceLayout[index].name,
        })),
    ];
    validateBindingCounts(
        device,
        [
            globalBindings.map((entry) => ({ entry, name: "global uniforms" })),
            markBindings,
            ...(usesPlacementLayout
                ? [
                      placementBindings.map((entry) => ({
                          entry,
                          name: "placement rectangles",
                      })),
                  ]
                : []),
        ],
        label
    );

    const descriptorKey = createDescriptorKey(
        resourceBindings,
        format,
        pickFormat,
        primitiveTopology,
        usesPlacementLayout,
        usesPickingEnabledOverride
    );

    const template = cache.getOrCreate(shaderCode, descriptorKey, (id) => {
        const diagnostics = {
            id,
            firstBorrowerLabel: label,
            borrowerLabels: new Set([label]),
        };
        const labelOwner =
            `${RENDERER_GPU_OWNER} program template #${id} ` +
            `(first used by ${label})`;
        const bindGroupLayout = device.createBindGroupLayout({
            label: gpuLabel(labelOwner, "bind group layout"),
            entries: markBindings.map(({ entry }) => entry),
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
        /** @type {Map<1 | 4, GPURenderPipeline>} */
        const pipelines = new Map();
        /** @param {1 | 4} sampleCount */
        const getPipeline = (sampleCount) => {
            let pipeline = pipelines.get(sampleCount);
            if (!pipeline) {
                pipeline = device.createRenderPipeline({
                    label: gpuLabel(
                        labelOwner,
                        sampleCount == 1
                            ? "render pipeline"
                            : `${sampleCount}x render pipeline`
                    ),
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
                    multisample: { count: sampleCount },
                });
                pipelines.set(sampleCount, pipeline);
            }
            return pipeline;
        };
        /** @type {GPURenderPipeline | undefined} */
        let pickPipeline;
        const getPickPipeline = () => {
            // Safari fails native compilation when a stage receives an unused
            // specialization constant. Only link geometry needs this override.
            const constants = usesPickingEnabledOverride
                ? { pickingEnabled: 1 }
                : undefined;
            pickPipeline ??= device.createRenderPipeline({
                label: gpuLabel(labelOwner, "picking pipeline"),
                ...common,
                vertex: { ...common.vertex, constants },
                fragment: {
                    module,
                    constants,
                    entryPoint: "fs_pick",
                    targets: [
                        {
                            format: pickFormat,
                        },
                    ],
                },
            });
            return pickPipeline;
        };
        return {
            bindGroupLayout,
            getPipeline,
            getPickPipeline,
            diagnostics,
        };
    });
    template.diagnostics.borrowerLabels.add(label);
    const immutableResourceLayout = resourceLayout.map((entry) =>
        Object.freeze({ ...entry })
    );
    Object.freeze(immutableResourceLayout);

    return { ...template, resourceLayout: immutableResourceLayout };
}
