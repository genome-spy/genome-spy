/**
 * @returns {import("../renderer.js").Renderer}
 */
export function createMockRenderer() {
    const device = {
        createBuffer: () => ({}),
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createShaderModule: () => ({}),
        createRenderPipeline: () => ({}),
        createBindGroup: () => ({}),
        queue: { writeBuffer: () => {} },
    };

    return /** @type {import("../renderer.js").Renderer} */ (
        /** @type {unknown} */ ({
            device,
            format: "rgba8unorm",
            _globalBindGroupLayout: {},
            _globalBindGroup: {},
            _globals: { width: 1, height: 1, dpr: 1 },
        })
    );
}
