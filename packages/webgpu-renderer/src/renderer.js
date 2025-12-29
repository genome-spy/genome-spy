import RectRenderer from "./marks/rectRenderer.js";

export class RendererError extends Error {}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("./index.d.ts").RendererOptions} [options]
 * @returns {Promise<Renderer>}
 */
export async function createRenderer(canvas, options = {}) {
    if (!navigator.gpu) {
        throw new RendererError("WebGPU is not supported in this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new RendererError("WebGPU adapter not available.");
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
        throw new RendererError("Could not create a WebGPU context.");
    }

    const format = options.format ?? navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device,
        format,
        alphaMode: options.alphaMode ?? "premultiplied",
    });

    return new Renderer({ device, context, format, canvas });
}

export class Renderer {
    /**
     * @typedef {import("./index.d.ts").MarkId} MarkId
     * @typedef {import("./index.d.ts").TypedArray} TypedArray
     */

    /**
     * @param {{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, canvas: HTMLCanvasElement }} params
     */
    constructor({ device, context, format, canvas }) {
        this.device = device;
        this.context = context;
        this.format = format;
        this.canvas = canvas;

        /** @type {Map<MarkId, import("./marks/rectRenderer.js").default>} */
        this._marks = new Map();
        this._nextMarkId = 1;

        // Global uniforms are shared by all marks (e.g., viewport size).
        this._globalUniformBuffer = device.createBuffer({
            size: 3 * 4,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Bind group 0 is reserved for global uniforms.
        this._globalBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility:
                        // eslint-disable-next-line no-undef
                        GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this._globalBindGroup = device.createBindGroup({
            layout: this._globalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this._globalUniformBuffer },
                },
            ],
        });

        this.updateGlobals({
            width: canvas.width || 1,
            height: canvas.height || 1,
            dpr: window.devicePixelRatio ?? 1,
        });
    }

    /**
     * @param {import("./index.d.ts").GlobalUniforms} globals
     * @returns {void}
     */
    updateGlobals(globals) {
        const { width, height, dpr } = globals;
        const data = new Float32Array([width, height, dpr]);
        this.device.queue.writeBuffer(this._globalUniformBuffer, 0, data);
        this._globals = { width, height, dpr };
    }

    /**
     * @param {import("./index.d.ts").MarkType} type
     * @param {import("./index.d.ts").MarkConfig} config
     * @returns {MarkId}
     */
    createMark(type, config) {
        let mark;
        if (type === "rect") {
            mark = new RectRenderer(this, config);
        } else {
            throw new RendererError(`Unknown mark type: ${type}`);
        }

        const markId = /** @type {MarkId} */ (this._nextMarkId++);
        this._marks.set(markId, mark);
        return markId;
    }

    /**
     * @param {import("./index.d.ts").MarkId} markId
     * @param {Record<string, TypedArray>} fields
     * @param {number} count
     * @returns {void}
     */
    updateInstances(markId, fields, count) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.updateInstances(fields, count);
    }

    /**
     * @param {MarkId} markId
     * @param {Record<string, number|number[]|{ domain?: [number, number], range?: [number, number] }>} uniforms
     * @returns {void}
     */
    updateUniforms(markId, uniforms) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.updateUniforms(uniforms);
    }

    /**
     * @returns {void}
     */
    render() {
        const commandEncoder = this.device.createCommandEncoder();
        const view = this.context.getCurrentTexture().createView();

        // One render pass for now; picking would be a second pass later.
        const pass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view,
                    clearValue: { r: 1, g: 1, b: 1, a: 1 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        // TODO: Draw order is currently insertion order. Consider safe batching.
        for (const mark of this._marks.values()) {
            mark.draw(pass);
        }

        pass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * @param {MarkId} markId
     * @returns {void}
     */
    destroyMark(markId) {
        const mark = this._marks.get(markId);
        if (mark) {
            mark.destroy();
            this._marks.delete(markId);
        }
    }
}
