import RectProgram from "./marks/programs/rectProgram.js";
import PointProgram from "./marks/programs/pointProgram.js";
import RuleProgram from "./marks/programs/ruleProgram.js";
import LinkProgram from "./marks/programs/linkProgram.js";
import TextProgram from "./marks/programs/textProgram.js";

/**
 * Renderer-level error for unsupported environments or invalid operations.
 */
export class RendererError extends Error {}

/**
 * Create a renderer instance and WebGPU device/context for a canvas.
 *
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

/**
 * Owns the WebGPU device, global uniforms, and mark programs.
 */
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
        // TODO: Use r32uint picking when available on all targets.
        this.pickFormat = /** @type {GPUTextureFormat} */ ("rgba8unorm");

        /** @type {Map<MarkId, import("./marks/programs/rectProgram.js").default | import("./marks/programs/pointProgram.js").default | import("./marks/programs/ruleProgram.js").default | import("./marks/programs/linkProgram.js").default | import("./marks/programs/textProgram.js").default>} */
        this._marks = new Map();
        this._nextMarkId = 1;
        this._pickingDirty = true;
        this._pickTexture = null;
        this._pickTextureView = null;
        this._pickReadbackBuffer = null;
        this._pickTextureSize = { width: 0, height: 0 };

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
        this.markPickingDirty();
    }

    /**
     * @template {import("./index.d.ts").MarkType} T
     * @param {T} type
     * @param {import("./index.d.ts").MarkConfig<T>} config
     * @returns {import("./index.d.ts").MarkHandle}
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
        this.markPickingDirty();
        const slotHandles = mark.getSlotHandles();
        return {
            markId,
            scales: slotHandles.scales,
            values: slotHandles.values,
            selections: slotHandles.selections,
        };
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
     * @returns {void}
     */
    markPickingDirty() {
        this._pickingDirty = true;
    }

    /**
     * @returns {void}
     */
    _ensurePickTarget() {
        const width = Math.max(1, this._globals?.width ?? 1);
        const height = Math.max(1, this._globals?.height ?? 1);
        const needsResize =
            !this._pickTexture ||
            this._pickTextureSize.width !== width ||
            this._pickTextureSize.height !== height;

        if (!needsResize) {
            return;
        }

        this._pickTexture?.destroy();
        this._pickTexture = this.device.createTexture({
            size: { width, height },
            format: this.pickFormat,
            // eslint-disable-next-line no-undef
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this._pickTextureView = this._pickTexture.createView();
        this._pickTextureSize = { width, height };
        this._pickReadbackBuffer?.destroy();
        this._pickReadbackBuffer = this.device.createBuffer({
            size: 256,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    /**
     * @returns {void}
     */
    _renderPick() {
        this._ensurePickTarget();
        const commandEncoder = this.device.createCommandEncoder();
        const pass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this._pickTextureView,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                },
            ],
        });

        for (const mark of this._marks.values()) {
            mark.drawPick(pass);
        }

        pass.end();
        this.device.queue.submit([commandEncoder.finish()]);
        this._pickingDirty = false;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {Promise<number|null>}
     */
    async pick(x, y) {
        if (!this._marks.size) {
            return null;
        }
        this._ensurePickTarget();
        if (this._pickingDirty) {
            this._renderPick();
        }

        const dpr = this._globals?.dpr ?? 1;
        const px = Math.floor(x * dpr);
        const py = Math.floor(y * dpr);
        if (
            px < 0 ||
            py < 0 ||
            px >= this._pickTextureSize.width ||
            py >= this._pickTextureSize.height
        ) {
            return null;
        }

        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyTextureToBuffer(
            {
                texture: this._pickTexture,
                origin: { x: px, y: py },
            },
            {
                buffer: this._pickReadbackBuffer,
                bytesPerRow: 256,
            },
            { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await this._pickReadbackBuffer.mapAsync(
            // eslint-disable-next-line no-undef
            GPUMapMode.READ,
            0,
            4
        );
        const data = new Uint8Array(
            this._pickReadbackBuffer.getMappedRange(0, 4)
        );
        const id = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
        this._pickReadbackBuffer.unmap();
        if (id === 0) {
            return null;
        }
        return (id - 1) >>> 0;
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

        // The pick pass is rendered on demand, separate from the main pass.
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
            this.markPickingDirty();
        }
    }
}
