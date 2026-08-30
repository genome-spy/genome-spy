import { ProgramTemplateCache } from "../marks/programs/internal/programTemplateCache.js";

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
            _fontResourceCache: new Map(),
            _nextFontResourceId: 1,
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
