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

    return new Renderer({
        device,
        context,
        format,
        canvas,
        onInvalidate: options.onInvalidate,
    });
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
     * @param {{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, canvas: HTMLCanvasElement, onInvalidate?: () => void }} params
     */
    constructor({ device, context, format, canvas, onInvalidate }) {
        this.device = device;
        this.context = context;
        this.format = format;
        this.canvas = canvas;
        this._onInvalidate = onInvalidate ?? (() => {});
        // TODO: Use r32uint picking when available on all targets.
        this.pickFormat = /** @type {GPUTextureFormat} */ ("rgba8unorm");

        /** @type {Map<MarkId, import("./index.d.ts").MarkProgram>} */
        this._marks = new Map();
        /** @type {NormalizedDraw[] | null} */
        this._renderFrame = null;
        this._nextMarkId = 1;
        this._pickingDirty = true;
        this._pickTexture = null;
        this._pickTextureView = null;
        this._pickReadbackBuffer = null;
        this._pickTextureSize = { width: 0, height: 0 };

        this._globalUniformStride = Math.max(
            16,
            device.limits.minUniformBufferOffsetAlignment
        );
        this._globalUniformCapacity = 1;

        // Each occurrence gets viewport-local globals at a dynamic offset.
        this._globalUniformBuffer = device.createBuffer({
            size: this._globalUniformStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Bind group 0 is reserved for global uniforms.
        this._globalBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                        hasDynamicOffset: true,
                        minBindingSize: 4 * 4,
                    },
                },
            ],
        });

        this._globalBindGroup = device.createBindGroup({
            layout: this._globalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this._globalUniformBuffer,
                        size: 4 * 4,
                    },
                },
            ],
        });

        const dpr = window.devicePixelRatio ?? 1;
        this.updateGlobals({
            width: (canvas.width || 1) / dpr,
            height: (canvas.height || 1) / dpr,
            dpr,
        });
    }

    /**
     * @param {import("./index.d.ts").GlobalUniforms} globals
     * @returns {void}
     */
    updateGlobals(globals) {
        const { width, height, dpr } = globals;
        assertPositiveFinite("width", width);
        assertPositiveFinite("height", height);
        assertPositiveFinite("dpr", dpr);
        this._globals = { width, height, dpr };
        this.markPickingDirty();
    }

    /**
     * @param {number} drawCount
     * @returns {void}
     */
    _ensureGlobalUniformCapacity(drawCount) {
        if (drawCount <= this._globalUniformCapacity) {
            return;
        }

        let capacity = this._globalUniformCapacity;
        while (capacity < drawCount) {
            capacity *= 2;
        }

        const oldBuffer = this._globalUniformBuffer;
        this._globalUniformBuffer = this.device.createBuffer({
            size: capacity * this._globalUniformStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._globalBindGroup = this.device.createBindGroup({
            layout: this._globalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this._globalUniformBuffer,
                        size: 4 * 4,
                    },
                },
            ],
        });
        this._globalUniformCapacity = capacity;
        oldBuffer.destroy();
    }

    /**
     * @param {NormalizedDraw[]} draws
     * @returns {void}
     */
    _writeDrawGlobals(draws) {
        if (!draws.length) {
            return;
        }

        this._ensureGlobalUniformCapacity(draws.length);
        const data = new Float32Array(
            (draws.length * this._globalUniformStride) / 4
        );
        for (let i = 0; i < draws.length; i++) {
            const offset = (i * this._globalUniformStride) / 4;
            data.set(
                [
                    draws[i].viewport.width,
                    draws[i].viewport.height,
                    this._globals.dpr,
                    0,
                ],
                offset
            );
        }
        this.device.queue.writeBuffer(this._globalUniformBuffer, 0, data);
    }

    /**
     * @template TConfig
     * @template {Record<string, import("./index.d.ts").SeriesData>} TSeries
     * @param {import("./index.d.ts").MarkDefinition<TConfig, TSeries>} definition
     * @param {TConfig} config
     * @returns {import("./index.d.ts").MarkHandle<TSeries>}
     */
    createMark(definition, config) {
        const mark = definition.createProgram(this, config);

        const markId = /** @type {MarkId} */ (this._nextMarkId++);
        this._marks.set(markId, mark);
        this.markPickingDirty();
        const slotHandles = mark.getSlotHandles();
        return {
            markId,
            series: slotHandles.series,
            scales: slotHandles.scales,
            values: slotHandles.values,
            selections: slotHandles.selections,
        };
    }

    /**
     * @returns {void}
     */
    markPickingDirty() {
        this._pickingDirty = true;
    }

    /**
     * Signals that asynchronous resource preparation changed visible output.
     * The host remains responsible for submitting the next frame.
     *
     * @returns {void}
     */
    _invalidate() {
        this.markPickingDirty();
        this._onInvalidate();
    }

    /**
     * @returns {void}
     */
    _ensurePickTarget() {
        const width = Math.max(1, this.canvas.width);
        const height = Math.max(1, this.canvas.height);
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
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this._pickTextureView = this._pickTexture.createView();
        this._pickTextureSize = { width, height };
        this._pickReadbackBuffer?.destroy();
        this._pickReadbackBuffer = this.device.createBuffer({
            size: 256,
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

        const draws =
            this._renderFrame ?? this._normalizeDraws(this._marks.keys());
        this._writeDrawGlobals(draws);
        this._encodeDraws(pass, draws, true);

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

        await this._pickReadbackBuffer.mapAsync(GPUMapMode.READ, 0, 4);
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
     * @param {import("./index.d.ts").RenderFrame} [frame]
     * @returns {void}
     */
    render(frame = {}) {
        const draws = this._normalizeDraws(frame.draws ?? this._marks.keys());
        this._writeDrawGlobals(draws);
        const commandEncoder = this.device.createCommandEncoder();
        const view = this.context.getCurrentTexture().createView();

        // The pick pass is rendered on demand, separate from the main pass.
        const pass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view,
                    clearValue: frame.clearColor ?? {
                        r: 1,
                        g: 1,
                        b: 1,
                        a: 1,
                    },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        this._encodeDraws(pass, draws, false);

        pass.end();
        this.device.queue.submit([commandEncoder.finish()]);
        this._renderFrame = draws;
        this._pickingDirty = true;
    }

    /**
     * @param {Iterable<import("./index.d.ts").DrawCommand | MarkId>} draws
     * @returns {NormalizedDraw[]}
     */
    _normalizeDraws(draws) {
        const canvas = {
            x: 0,
            y: 0,
            width: this._globals.width,
            height: this._globals.height,
        };
        return Array.from(draws, (draw) => {
            const command =
                typeof draw == "number" ? { mark: { markId: draw } } : draw;
            const markId = command.mark.markId;
            const mark = this._marks.get(markId);
            if (!mark) {
                throw new RendererError(`No such mark: ${markId}`);
            }

            const viewport = { ...(command.viewport ?? canvas) };
            assertRect("viewport", viewport);
            if (
                viewport.x < 0 ||
                viewport.y < 0 ||
                viewport.x + viewport.width > canvas.width ||
                viewport.y + viewport.height > canvas.height
            ) {
                throw new RendererError(
                    "Viewport must be contained within the logical canvas."
                );
            }

            const scissor = intersectRects(command.scissor ?? canvas, canvas);
            const firstInstance = command.firstInstance ?? 0;
            assertNonNegativeInteger("firstInstance", firstInstance);
            const instanceCount =
                command.instanceCount ?? mark.count - firstInstance;
            assertNonNegativeInteger("instanceCount", instanceCount);
            if (firstInstance + instanceCount > mark.count) {
                throw new RendererError(
                    `Instance range exceeds mark count: ${mark.count}.`
                );
            }

            return {
                markId,
                viewport,
                scissor,
                firstInstance,
                instanceCount,
            };
        }).filter((draw) => draw.scissor.width > 0 && draw.scissor.height > 0);
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {NormalizedDraw[]} draws
     * @param {boolean} picking
     * @returns {void}
     */
    _encodeDraws(pass, draws, picking) {
        const dpr = this._globals.dpr;
        for (let i = 0; i < draws.length; i++) {
            const draw = draws[i];
            const mark = this._marks.get(draw.markId);
            if (!mark) {
                continue;
            }

            pass.setViewport(
                draw.viewport.x * dpr,
                draw.viewport.y * dpr,
                draw.viewport.width * dpr,
                draw.viewport.height * dpr,
                0,
                1
            );
            const scissor = toPhysicalScissor(draw.scissor, dpr);
            pass.setScissorRect(
                scissor.x,
                scissor.y,
                scissor.width,
                scissor.height
            );
            pass.setBindGroup(0, this._globalBindGroup, [
                i * this._globalUniformStride,
            ]);
            const options = {
                firstInstance: draw.firstInstance,
                instanceCount: draw.instanceCount,
            };
            if (picking) {
                mark.drawPick(pass, options);
            } else {
                mark.draw(pass, options);
            }
        }
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

/**
 * @typedef {{
 *   markId: import("./index.d.ts").MarkId,
 *   viewport: import("./index.d.ts").DrawRect,
 *   scissor: import("./index.d.ts").DrawRect,
 *   firstInstance: number,
 *   instanceCount: number,
 * }} NormalizedDraw
 */

/**
 * @param {string} name
 * @param {number} value
 */
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RendererError(`${name} must be a positive finite number.`);
    }
}

/**
 * @param {string} name
 * @param {number} value
 */
function assertNonNegativeInteger(name, value) {
    if (!Number.isInteger(value) || value < 0) {
        throw new RendererError(`${name} must be a non-negative integer.`);
    }
}

/**
 * @param {string} name
 * @param {import("./index.d.ts").DrawRect} rect
 */
function assertRect(name, rect) {
    if (
        !Number.isFinite(rect.x) ||
        !Number.isFinite(rect.y) ||
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height) ||
        rect.width <= 0 ||
        rect.height <= 0
    ) {
        throw new RendererError(
            `${name} must have finite coordinates and positive dimensions.`
        );
    }
}

/**
 * @param {import("./index.d.ts").DrawRect} rect
 * @param {import("./index.d.ts").DrawRect} bounds
 * @returns {import("./index.d.ts").DrawRect}
 */
function intersectRects(rect, bounds) {
    assertRect("scissor", rect);
    const x = Math.max(rect.x, bounds.x);
    const y = Math.max(rect.y, bounds.y);
    const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
    const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
    return {
        x,
        y,
        width: Math.max(0, right - x),
        height: Math.max(0, bottom - y),
    };
}

/**
 * @param {import("./index.d.ts").DrawRect} rect
 * @param {number} dpr
 */
function toPhysicalScissor(rect, dpr) {
    const x = Math.floor(rect.x * dpr);
    const y = Math.floor(rect.y * dpr);
    const right = Math.ceil((rect.x + rect.width) * dpr);
    const bottom = Math.ceil((rect.y + rect.height) * dpr);
    return { x, y, width: right - x, height: bottom - y };
}
