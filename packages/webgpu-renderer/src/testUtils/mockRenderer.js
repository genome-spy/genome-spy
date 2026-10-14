import { ProgramTemplateCache } from "../marks/programs/internal/programTemplateCache.js";

export const mockGpuLimits = {
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    maxBufferSize: 268435456,
    maxStorageBuffersPerShaderStage: 8,
    maxUniformBuffersPerShaderStage: 12,
    maxSampledTexturesPerShaderStage: 16,
    maxSamplersPerShaderStage: 16,
    maxStorageTexturesPerShaderStage: 4,
    maxBindGroups: 4,
    maxBindingsPerBindGroup: 1000,
};

/**
 * @returns {import("../renderer.js").Renderer}
 */
export function createMockRenderer() {
    const device = {
        limits: mockGpuLimits,
        createBuffer: (/** @type {GPUBufferDescriptor} */ { size }) => ({
            size,
            destroy() {},
        }),
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createShaderModule: () => ({}),
        createRenderPipeline: () => ({}),
        createBindGroup: () => ({}),
        createSampler: () => ({}),
        createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
        queue: {
            writeBuffer: () => {},
            writeTexture: () => {},
            copyExternalImageToTexture: () => {},
        },
    };

    return /** @type {import("../renderer.js").Renderer} */ (
        /** @type {unknown} */ ({
            device,
            format: "rgba8unorm",
            pickFormat: "rgba8unorm",
            _programTemplateCache: new ProgramTemplateCache(() => {}),
            _globalBindGroupLayout: {},
            _globalBindGroup: {},
            _placementBindGroupLayout: {},
            _globals: { width: 1, height: 1, dpr: 1 },
            markPickingDirty: () => {},
            _invalidate: () => {},
            _assertAlive: () => {},
            _isAlive: () => true,
        })
    );
}
