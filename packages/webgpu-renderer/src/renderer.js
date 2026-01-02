import RectProgram from "./marks/programs/rectProgram.js";
import PointProgram from "./marks/programs/pointProgram.js";
import RuleProgram from "./marks/programs/ruleProgram.js";
import LinkProgram from "./marks/programs/linkProgram.js";
import TextProgram from "./marks/programs/textProgram.js";

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

    // Temporary workaround while we reduce storage buffer bindings.
    const maxStorageBuffersPerShaderStage = Math.min(
        10,
        adapter.limits.maxStorageBuffersPerShaderStage
    );
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBuffersPerShaderStage,
        },
    });
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

        /** @type {Map<MarkId, import("./marks/programs/rectProgram.js").default | import("./marks/programs/pointProgram.js").default | import("./marks/programs/ruleProgram.js").default | import("./marks/programs/linkProgram.js").default | import("./marks/programs/textProgram.js").default>} */
        this._marks = new Map();
        this._nextMarkId = 1;

        // Global uniforms are shared by all marks (e.g., viewport size).
        this._globalUniformBuffer = device.createBuffer({
            size: 4 * 4,
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
        const data = new Float32Array([width, height, dpr, 0]);
        this.device.queue.writeBuffer(this._globalUniformBuffer, 0, data);
        this._globals = { width, height, dpr };
    }

    /**
     * @template {import("./index.d.ts").MarkType} T
     * @param {T} type
     * @param {import("./index.d.ts").MarkConfig<T>} config
     * @returns {MarkId}
     */
    createMark(type, config) {
        let mark;
        if (type === "rect") {
            mark = new RectProgram(
                this,
                /** @type {import("./index.d.ts").MarkConfig<"rect">} */ (
                    config
                )
            );
        } else if (type === "point") {
            mark = new PointProgram(
                this,
                /** @type {import("./index.d.ts").MarkConfig<"point">} */ (
                    config
                )
            );
        } else if (type === "rule") {
            mark = new RuleProgram(
                this,
                /** @type {import("./index.d.ts").MarkConfig<"rule">} */ (
                    config
                )
            );
        } else if (type === "link") {
            mark = new LinkProgram(
                this,
                /** @type {import("./index.d.ts").MarkConfig<"link">} */ (
                    config
                )
            );
        } else if (type === "text") {
            mark = new TextProgram(
                this,
                /** @type {import("./index.d.ts").MarkConfig<"text">} */ (
                    config
                )
            );
        } else {
            throw new RendererError(`Unknown mark type: ${type}`);
        }

        const markId = /** @type {MarkId} */ (this._nextMarkId++);
        this._marks.set(markId, mark);
        return markId;
    }

    /**
     * @param {import("./index.d.ts").MarkId} markId
     * @param {Record<string, TypedArray>} channels
     * @param {number} [count]
     * @returns {void}
     */
    updateSeries(markId, channels, count) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.updateSeries(channels, count);
    }

    /**
     * @param {MarkId} markId
     * @param {Record<string, number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }>} values
     * @returns {void}
     */
    updateValues(markId, values) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.updateValues(values);
    }

    /**
     * @param {MarkId} markId
     * @param {Record<string, number[]>} domains
     * @returns {void}
     */
    updateScaleDomains(markId, domains) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.updateScaleDomains(domains);
    }

    /**
     * @param {MarkId} markId
     * @param {Record<string, Array<number|number[]|string>>} ranges
     * @returns {void}
     */
    updateScaleRanges(markId, ranges) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.updateScaleRanges(ranges);
    }

    /**
     * Log the GPU resources reserved by a mark to the console.
     *
     * @param {MarkId} markId
     * @param {string} [label]
     * @returns {void}
     */
    debugResources(markId, label) {
        const mark = this._marks.get(markId);
        if (!mark) {
            throw new RendererError(`No such mark: ${markId}`);
        }
        mark.debugResources(label);
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
