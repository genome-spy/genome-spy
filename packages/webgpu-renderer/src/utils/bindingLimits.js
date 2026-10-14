/** @type {GPUBindGroupLayoutEntry[]} */
export const globalBindings = [
    {
        binding: 0,
        visibility: 3,
        buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 80 },
    },
];

/** @type {GPUBindGroupLayoutEntry[]} */
export const placementBindings = [
    { binding: 0, visibility: 1, buffer: { type: "read-only-storage" } },
];

/**
 * Count the complete pipeline layout, including resources shared across marks.
 *
 * @param {GPUDevice} device
 * @param {Array<Array<{entry: GPUBindGroupLayoutEntry, name: string}>>} groups
 * @param {string} label
 */
export function validateBindingCounts(device, groups, label) {
    if (groups.length > device.limits.maxBindGroups) {
        throw new Error(
            `${label} requires ${groups.length} bind groups; maxBindGroups allows ${device.limits.maxBindGroups}.`
        );
    }
    for (const group of groups) {
        if (group.length > device.limits.maxBindingsPerBindGroup) {
            throw new Error(
                `${label} requires ${group.length} bindings in one group; maxBindingsPerBindGroup allows ${device.limits.maxBindingsPerBindGroup}.`
            );
        }
    }
    const entries = groups.flat();
    for (const [stage, mask] of /** @type {const} */ ([
        ["vertex", 1],
        ["fragment", 2],
        ["compute", 4],
    ])) {
        /** @type {Map<"maxUniformBuffersPerShaderStage"|"maxStorageBuffersPerShaderStage"|"maxSampledTexturesPerShaderStage"|"maxSamplersPerShaderStage"|"maxStorageTexturesPerShaderStage", string[]>} */
        const resources = new Map();
        for (const { entry, name } of entries) {
            if (!(entry.visibility & mask)) continue;
            const limit = entry.buffer
                ? !entry.buffer.type || entry.buffer.type === "uniform"
                    ? "maxUniformBuffersPerShaderStage"
                    : "maxStorageBuffersPerShaderStage"
                : entry.texture
                  ? "maxSampledTexturesPerShaderStage"
                  : entry.sampler
                    ? "maxSamplersPerShaderStage"
                    : entry.storageTexture
                      ? "maxStorageTexturesPerShaderStage"
                      : null;
            if (limit) {
                const names = resources.get(limit) ?? [];
                names.push(name);
                resources.set(limit, names);
            }
        }
        for (const [limit, names] of resources) {
            if (names.length > device.limits[limit]) {
                throw new Error(
                    `${label} ${stage} stage requires ${names.length} resources; ${limit} allows ${device.limits[limit]}. Resources: ${names.join(", ")}.`
                );
            }
        }
    }
}
