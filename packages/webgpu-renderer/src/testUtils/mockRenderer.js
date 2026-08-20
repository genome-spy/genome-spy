/**
 * @returns {import("../renderer.js").Renderer}
 */
export function createMockRenderer() {
    const device = {
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
        createTexture: () => ({ createView: () => ({}) }),
        queue: { writeBuffer: () => {}, writeTexture: () => {} },
    };

    return /** @type {import("../renderer.js").Renderer} */ (
        /** @type {unknown} */ ({
            device,
            format: "rgba8unorm",
            pickFormat: "rgba8unorm",
            _globalBindGroupLayout: {},
            _globalBindGroup: {},
            _globals: { width: 1, height: 1, dpr: 1 },
            markPickingDirty: () => {},
        })
    );
}
