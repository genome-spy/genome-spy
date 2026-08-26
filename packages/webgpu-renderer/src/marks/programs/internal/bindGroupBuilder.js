import { gpuLabel } from "../../../utils/gpuLabel.js";

/**
 * @typedef {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }} ResourceLayoutEntry
 *
 * @typedef {object} BindGroupBuildParams
 * @prop {GPUDevice} device
 * @prop {string} [label]
 * @prop {GPUBindGroupLayout} layout
 * @prop {GPUBuffer} uniformBuffer
 * @prop {ResourceLayoutEntry[]} resourceLayout
 * @prop {(name: string) => GPUBuffer | null} getSeriesBuffer
 * @prop {(name: string) => ReturnType<import("./scaleResources.js").ScaleResourceManager["getChannelResources"]>} getScaleResources
 * @prop {Map<string, { texture: GPUTexture, sampler?: GPUSampler, width: number, height: number, format: GPUTextureFormat }>} extraTextures
 * @prop {Map<string, GPUBuffer>} extraBuffers
 */

/**
 * Assemble a bind group from resource layout + resolved GPU resources.
 *
 * @param {BindGroupBuildParams} params
 * @returns {GPUBindGroup}
 */
export function buildBindGroup({
    device,
    label = "mark",
    layout,
    uniformBuffer,
    resourceLayout,
    getSeriesBuffer,
    getScaleResources,
    extraTextures,
    extraBuffers,
}) {
    /** @type {GPUBindGroupEntry[]} */
    const entries = [
        {
            binding: 0,
            resource: { buffer: uniformBuffer },
        },
    ];

    let bindingIndex = 1;
    for (const entry of resourceLayout) {
        if (entry.role === "series") {
            const buffer = getSeriesBuffer(entry.name);
            if (!buffer) {
                throw new Error(`Missing buffer binding for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: { buffer },
            });
            continue;
        }
        const scaleResources = getScaleResources(entry.name);
        if (entry.role === "ordinalRange") {
            const buffer = scaleResources?.ordinalRange?.buffer;
            if (!buffer) {
                throw new Error(`Missing buffer binding for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: { buffer },
            });
            continue;
        }
        if (entry.role === "domainMap") {
            const buffer = scaleResources?.domainMap?.buffer;
            if (!buffer) {
                throw new Error(
                    `Missing domain map buffer for "${entry.name}".`
                );
            }
            entries.push({
                binding: bindingIndex++,
                resource: { buffer },
            });
            continue;
        }
        if (entry.role === "rangeTexture") {
            const texture = scaleResources?.rangeTexture?.texture;
            if (!texture) {
                throw new Error(`Missing range texture for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: texture.createView({
                    label: gpuLabel(
                        label,
                        `scale ${entry.name} range texture view`
                    ),
                }),
            });
            continue;
        }
        if (entry.role === "rangeSampler") {
            const sampler = scaleResources?.rangeTexture?.sampler;
            if (!sampler) {
                throw new Error(`Missing range sampler for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: sampler,
            });
            continue;
        }
        if (entry.role === "extraTexture") {
            const texture = extraTextures.get(entry.name)?.texture;
            if (!texture) {
                throw new Error(`Missing extra texture for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: texture.createView({
                    label: gpuLabel(label, `${entry.name} texture view`),
                }),
            });
            continue;
        }
        if (entry.role === "extraSampler") {
            const sampler = extraTextures.get(entry.name)?.sampler;
            if (!sampler) {
                throw new Error(`Missing extra sampler for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: sampler,
            });
            continue;
        }
        if (entry.role === "extraBuffer") {
            const buffer = extraBuffers.get(entry.name) ?? null;
            if (!buffer) {
                throw new Error(`Missing extra buffer for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: { buffer },
            });
            continue;
        }
        throw new Error(`Unknown resource binding role "${entry.role}".`);
    }

    return device.createBindGroup({
        label: gpuLabel(label, "bind group"),
        layout,
        entries,
    });
}
