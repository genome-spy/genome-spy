/* global GPUAdapter, window */

/**
 * Browser init script. Observe actual API descriptors, including invalid layout
 * attempts, without changing the requested limits or renderer resource layout.
 * This function is serialized by Playwright and must remain self-contained.
 */
export function installWebGpuLimitAudit() {
    /** @type {{ devices: any[], violations: string[] }} */
    const audit = { devices: [], violations: [] };
    window.__webGpuLimitAudit = audit;
    if (typeof GPUAdapter === "undefined") return;

    const requestDevice = GPUAdapter.prototype.requestDevice;
    /** @param {GPUDeviceDescriptor} [descriptor] */
    GPUAdapter.prototype.requestDevice = async function (descriptor = {}) {
        if (
            Object.values(descriptor.requiredLimits ?? {}).some(
                (v) => v !== undefined
            )
        ) {
            audit.violations.push("requestDevice must use default limits.");
            throw new Error("WebGPU example audit rejects requiredLimits.");
        }

        const device = await requestDevice.call(this, descriptor);
        const limits = Object.fromEntries(
            Object.keys(Object.getPrototypeOf(device.limits))
                .filter((key) => typeof device.limits[key] === "number")
                .map((key) => [key, device.limits[key]])
        );
        /** @type {{ limits: Record<string, number>, peaks: Record<string, {used: number, limit: number, label: string}>, layouts: any[], validationErrors: string[] }} */
        const record = { limits, peaks: {}, layouts: [], validationErrors: [] };
        audit.devices.push(record);
        device.addEventListener("uncapturederror", (event) => {
            record.validationErrors.push(event.error.message);
        });
        /** @type {WeakMap<GPUBindGroupLayout, GPUBindGroupLayoutEntry[]>} */
        const layouts = new WeakMap();

        /** @param {string} limit @param {number} used @param {string} label */
        function observe(limit, used, label = "unlabeled resource") {
            if (!record.peaks[limit] || used > record.peaks[limit].used) {
                record.peaks[limit] = { used, limit: limits[limit], label };
            }
        }

        const createBindGroupLayout = device.createBindGroupLayout.bind(device);
        /** @param {GPUBindGroupLayoutDescriptor} descriptor */
        device.createBindGroupLayout = (descriptor) => {
            const entries = Array.from(descriptor.entries);
            observe(
                "maxBindingsPerBindGroup",
                entries.length,
                descriptor.label
            );
            const layout = createBindGroupLayout({ ...descriptor, entries });
            layouts.set(layout, entries);
            return layout;
        };

        const createPipelineLayout = device.createPipelineLayout.bind(device);
        /** @param {GPUPipelineLayoutDescriptor} descriptor */
        device.createPipelineLayout = (descriptor) => {
            const groups = Array.from(descriptor.bindGroupLayouts);
            const entries = groups.flatMap((group) =>
                group ? layouts.get(group) : []
            );
            const label = descriptor.label ?? "unlabeled pipeline layout";
            /** @type {Record<string, Record<string, number>>} */
            const stages = {};
            observe("maxBindGroups", groups.length, label);
            for (const [stage, mask] of [
                ["vertex", 1],
                ["fragment", 2],
                ["compute", 4],
            ]) {
                /** @type {Record<string, number>} */
                const counts = {};
                for (const entry of entries) {
                    if (!(entry.visibility & mask)) continue;
                    const limit = entry.buffer
                        ? entry.buffer.type === undefined ||
                          entry.buffer.type === "uniform"
                            ? "maxUniformBuffersPerShaderStage"
                            : "maxStorageBuffersPerShaderStage"
                        : entry.sampler
                          ? "maxSamplersPerShaderStage"
                          : entry.texture
                            ? "maxSampledTexturesPerShaderStage"
                            : entry.storageTexture
                              ? "maxStorageTexturesPerShaderStage"
                              : undefined;
                    if (limit) counts[limit] = (counts[limit] ?? 0) + 1;
                }
                for (const [limit, used] of Object.entries(counts)) {
                    observe(limit, used, `${label} (${stage})`);
                }
                stages[stage] = counts;
            }
            record.layouts.push({
                label,
                groups: groups.length,
                stages,
                bindings: entries,
            });
            return createPipelineLayout({
                ...descriptor,
                bindGroupLayouts: groups,
            });
        };

        const createBuffer = device.createBuffer.bind(device);
        /** @param {GPUBufferDescriptor} descriptor */
        device.createBuffer = (descriptor) => {
            observe("maxBufferSize", descriptor.size, descriptor.label);
            return createBuffer(descriptor);
        };

        const createBindGroup = device.createBindGroup.bind(device);
        /** @param {GPUBindGroupDescriptor} descriptor */
        device.createBindGroup = (descriptor) => {
            const entries = Array.from(descriptor.entries);
            const layout = layouts.get(descriptor.layout);
            for (const entry of entries) {
                const resource = entry.resource;
                if (!resource.buffer) continue;
                const binding = layout?.find(
                    (item) => item.binding === entry.binding
                );
                // Auto-layout compute pipelines are validated by WebGPU itself.
                if (!binding?.buffer) continue;
                const uniform =
                    !binding.buffer.type || binding.buffer.type === "uniform";
                observe(
                    uniform
                        ? "maxUniformBufferBindingSize"
                        : "maxStorageBufferBindingSize",
                    resource.size ??
                        resource.buffer.size - (resource.offset ?? 0),
                    descriptor.label
                );
            }
            return createBindGroup({ ...descriptor, entries });
        };
        return device;
    };
}
