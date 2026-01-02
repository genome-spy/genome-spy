/**
 * @typedef {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler" }} ResourceLayoutEntry
 *
 * @typedef {object} BindGroupBuildParams
 * @prop {GPUDevice} device
 * @prop {GPUBindGroupLayout} layout
 * @prop {GPUBuffer} uniformBuffer
 * @prop {ResourceLayoutEntry[]} resourceLayout
 * @prop {(name: string) => GPUBuffer | null} getSeriesBuffer
 * @prop {Map<string, GPUBuffer>} ordinalRangeBuffers
 * @prop {Map<string, GPUBuffer>} domainMapBuffers
 * @prop {Map<string, { texture: GPUTexture, sampler: GPUSampler }>} rangeTextures
 * @prop {Map<string, { texture: GPUTexture, sampler?: GPUSampler, width: number, height: number, format: GPUTextureFormat }>} extraTextures
 */

/**
 * Assemble a bind group from resource layout + resolved GPU resources.
 *
 * @param {BindGroupBuildParams} params
 * @returns {GPUBindGroup}
 */
export function buildBindGroup({
    device,
    layout,
    uniformBuffer,
    resourceLayout,
    getSeriesBuffer,
    ordinalRangeBuffers,
    domainMapBuffers,
    rangeTextures,
    extraTextures,
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
        if (entry.role === "ordinalRange") {
            const buffer = ordinalRangeBuffers.get(entry.name) ?? null;
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
            const buffer = domainMapBuffers.get(entry.name) ?? null;
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
            const texture = rangeTextures.get(entry.name)?.texture;
            if (!texture) {
                throw new Error(`Missing range texture for "${entry.name}".`);
            }
            entries.push({
                binding: bindingIndex++,
                resource: texture.createView(),
            });
            continue;
        }
        if (entry.role === "rangeSampler") {
            const sampler = rangeTextures.get(entry.name)?.sampler;
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
                resource: texture.createView(),
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
        throw new Error(`Unknown resource binding role "${entry.role}".`);
    }

    return device.createBindGroup({
        layout,
        entries,
    });
}
