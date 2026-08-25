/**
 * Renderer-level error for unsupported environments or invalid operations.
 */
export class RendererError extends Error {}

const profilerKey = Symbol.for("genome-spy.performance-profiler");

/** @returns {{enabled: boolean, addPhase: Function, addCount: Function} | undefined} */
function getProfiler() {
    return /** @type {any} */ (globalThis)[profilerKey];
}

/** @param {string} name @param {number} duration */
function addPhase(name, duration) {
    getProfiler()?.addPhase(name, duration);
}

/** @param {string} name @param {number} [value] */
function addCount(name, value) {
    getProfiler()?.addCount(name, value);
}

/** @returns {number} */
function startPhase() {
    if (!getProfiler()?.enabled) {
        return 0;
    }
    return performance.now();
}

/** @param {string} name @param {number} start */
function finishPhase(name, start) {
    if (start) {
        addPhase(name, performance.now() - start);
    }
}

class PlacementSet {
    /** @param {Renderer} renderer @param {number} id @param {import("./index.d.ts").PlacementSetData} data */
    constructor(renderer, id, data) {
        this.renderer = renderer;
        this.placementSetId = id;
        this._destroyed = false;
        this._rectangles = validatePlacementData(data);
        this._buffer = createPlacementBuffer(renderer.device, this._rectangles);
        this._bindGroup = this._createBindGroup();
    }

    get count() {
        return this._rectangles.length / 4;
    }

    get bindGroup() {
        if (this._destroyed) {
            throw new RendererError("Placement set has been destroyed.");
        }
        return this._bindGroup;
    }

    _createBindGroup() {
        return this.renderer.device.createBindGroup({
            layout: this.renderer._placementBindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this._buffer } }],
        });
    }

    /** @param {import("./index.d.ts").PlacementSetData} data */
    replace(data) {
        if (this._destroyed) {
            throw new RendererError("Placement set has been destroyed.");
        }
        const rectangles = validatePlacementData(data);
        if (rectangles.byteLength > this._buffer.size) {
            addCount("placementBufferRecreations");
            const oldBuffer = this._buffer;
            this._buffer = createPlacementBuffer(
                this.renderer.device,
                rectangles
            );
            this._bindGroup = this._createBindGroup();
            oldBuffer.destroy();
        } else if (rectangles.byteLength) {
            addCount("placementBufferReplacements");
            addCount("placementUploadCalls");
            addCount("placementUploadBytes", rectangles.byteLength);
            this.renderer.device.queue.writeBuffer(
                this._buffer,
                0,
                /** @type {Float32Array<ArrayBuffer>} */ (rectangles)
            );
        }
        this._rectangles = rectangles;
        this.renderer._renderFrame = null;
        this.renderer._pickingFrame = null;
        addCount("retainedNormalFrameInvalidations");
        addCount("retainedPickingFrameInvalidations");
        this.renderer.markPickingDirty();
    }

    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this._buffer.destroy();
        this.renderer._placementSets.delete(this.placementSetId);
        this.renderer._renderFrame = null;
        this.renderer._pickingFrame = null;
        this.renderer.markPickingDirty();
    }
}

/** @param {import("./index.d.ts").PlacementSetData} data @returns {Float32Array} */
function validatePlacementData(data) {
    if (!data || !(data.rectangles instanceof Float32Array)) {
        throw new RendererError(
            "Placement data must contain Float32Array rectangles."
        );
    }
    if (data.rectangles.length % 4 !== 0) {
        throw new RendererError(
            "Placement rectangles must contain four values per entry."
        );
    }
    for (let index = 0; index < data.rectangles.length; index += 4) {
        const x = data.rectangles[index];
        const y = data.rectangles[index + 1];
        const width = data.rectangles[index + 2];
        const height = data.rectangles[index + 3];
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 0 ||
            height < 0
        ) {
            throw new RendererError(
                "Placement rectangles must contain finite coordinates and non-negative sizes."
            );
        }
    }
    const profiler = getProfiler();
    if (!profiler?.enabled) {
        return new Float32Array(data.rectangles);
    }
    const start = performance.now();
    const rectangles = new Float32Array(data.rectangles);
    addCount("placementValidationSnapshotBytes", rectangles.byteLength);
    addPhase("placementValidationSnapshot", performance.now() - start);
    return rectangles;
}

/** @param {GPUDevice} device @param {Float32Array} rectangles @returns {GPUBuffer} */
function createPlacementBuffer(device, rectangles) {
    const buffer = device.createBuffer({
        size: Math.max(16, rectangles.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (rectangles.byteLength) {
        addCount("placementUploadCalls");
        addCount("placementUploadBytes", rectangles.byteLength);
        device.queue.writeBuffer(
            buffer,
            0,
            /** @type {Float32Array<ArrayBuffer>} */ (rectangles)
        );
    }
    return buffer;
}

/** @param {"x" | "y" | "xy" | undefined} value */
function placementClipMode(value) {
    return value === "x" ? 1 : value === "y" ? 2 : value === "xy" ? 3 : 0;
}

/** @param {number} byteLength */
function createGlobalUniformStaging(byteLength) {
    const buffer = new ArrayBuffer(byteLength);
    return {
        buffer,
        floats: new Float32Array(buffer),
        integers: new Uint32Array(buffer),
    };
}

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

    const device = await adapter.requestDevice();
    instrumentGpuDevice(device);
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
        this._destroyed = false;
        // TODO: Use r32uint picking when available on all targets.
        this.pickFormat = /** @type {GPUTextureFormat} */ ("rgba8unorm");

        /** @type {Map<MarkId, import("./index.d.ts").MarkProgram>} */
        this._marks = new Map();
        /** @type {Map<number, PlacementSet>} */
        this._placementSets = new Map();
        /** @type {NormalizedDraw[] | null} */
        this._renderFrame = null;
        /** @type {NormalizedDraw[] | null} */
        this._pickingFrame = null;
        this._nextMarkId = 1;
        this._nextPlacementSetId = 1;
        this._pickingDirty = true;
        this._pickTexture = null;
        this._pickTextureView = null;
        this._pickReadbackBuffer = null;
        this._pickTextureSize = { width: 0, height: 0 };
        /**
         * @type {{ x: number, y: number, resolve: (value: number|null) => void, reject: (reason: unknown) => void } | null}
         */
        this._pickPending = null;
        /** @type {Promise<unknown> | null} */
        this._pickInFlight = null;

        this._globalUniformStride = Math.max(
            80,
            device.limits.minUniformBufferOffsetAlignment
        );
        this._globalUniformCapacity = 1;
        this._globalUniformStaging = createGlobalUniformStaging(
            this._globalUniformStride
        );

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
                        minBindingSize: 80,
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
                        size: 80,
                    },
                },
            ],
        });

        this._placementBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" },
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
        this._assertAlive();
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
        this._globalUniformStaging = createGlobalUniformStaging(
            capacity * this._globalUniformStride
        );
        this._globalBindGroup = this.device.createBindGroup({
            layout: this._globalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this._globalUniformBuffer,
                        size: 80,
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
        const phaseStart = startPhase();
        if (!draws.length) {
            finishPhase("drawGlobals", phaseStart);
            return;
        }

        this._ensureGlobalUniformCapacity(draws.length);
        const { buffer, floats, integers } = this._globalUniformStaging;
        for (let i = 0; i < draws.length; i++) {
            const offset = (i * this._globalUniformStride) / 4;
            const draw = draws[i];
            floats[offset] = draw.viewport.width;
            floats[offset + 1] = draw.viewport.height;
            floats[offset + 2] = this._globals.dpr;
            floats[offset + 4] = draw.visibleRange.x1;
            floats[offset + 5] = draw.visibleRange.y1;
            floats[offset + 6] = draw.visibleRange.x2;
            floats[offset + 7] = draw.visibleRange.y2;
            floats[offset + 8] = draw.visibleRange.cullX ? 1 : 0;
            floats[offset + 9] = draw.visibleRange.cullY ? 1 : 0;
            floats[offset + 12] = draw.viewport.x;
            floats[offset + 13] = draw.viewport.y;
            floats[offset + 14] = draw.viewport.width;
            floats[offset + 15] = draw.viewport.height;
            integers[offset + 16] = draw.placement?.index ?? 0;
            integers[offset + 17] = draw.placement?.clipMode ?? 0;
            integers[offset + 18] = draw.placement?.count ?? 0;
        }
        this.device.queue.writeBuffer(
            this._globalUniformBuffer,
            0,
            buffer,
            0,
            draws.length * this._globalUniformStride
        );
        addCount("drawGlobalWrites");
        addCount("drawGlobalBytes", draws.length * this._globalUniformStride);
        finishPhase("drawGlobals", phaseStart);
    }

    /**
     * @template TConfig
     * @template {Record<string, import("./index.d.ts").SeriesData>} TSeries
     * @template {object} TProperties
     * @param {import("./index.d.ts").MarkDefinition<TConfig, TSeries, TProperties>} definition
     * @param {TConfig} config
     * @returns {import("./index.d.ts").MarkHandle<TSeries, TProperties>}
     */
    createMark(definition, config) {
        this._assertAlive();
        const mark = definition.createProgram(this, config);

        const markId = /** @type {MarkId} */ (this._nextMarkId++);
        this._marks.set(markId, mark);
        this.markPickingDirty();
        const slotHandles = mark.getSlotHandles();
        return {
            markId,
            batchUpdates: slotHandles.batchUpdates,
            series: slotHandles.series,
            scales: slotHandles.scales,
            values: slotHandles.values,
            properties: slotHandles.properties,
            extraValues: slotHandles.extraValues,
            scalarSlots: slotHandles.scalarSlots,
            selections: slotHandles.selections,
        };
    }

    /** @param {import("./index.d.ts").PlacementSetData} data */
    createPlacementSet(data) {
        this._assertAlive();
        const set = new PlacementSet(this, this._nextPlacementSetId++, data);
        this._placementSets.set(set.placementSetId, set);
        return set;
    }

    /**
     * @returns {void}
     */
    markPickingDirty() {
        if (this._destroyed) {
            return;
        }
        this._pickingDirty = true;
    }

    /**
     * Signals that asynchronous resource preparation changed visible output.
     * The host remains responsible for submitting the next frame.
     *
     * @returns {void}
     */
    _invalidate() {
        if (this._destroyed) {
            return;
        }
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
        addCount("pickingRenders");
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
            this._pickingFrame ??
            this._renderFrame ??
            this._normalizeDraws(this._marks.keys());
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
    pick(x, y) {
        this._assertAlive();
        return new Promise((resolve, reject) => {
            this._pickPending?.resolve(null);
            this._pickPending = { x, y, resolve, reject };
            this._startNextPick();
        });
    }

    /**
     * Start the latest queued pick when no GPU readback is in flight.
     *
     * @returns {void}
     */
    _startNextPick() {
        if (this._pickInFlight || !this._pickPending) {
            return;
        }

        const request = this._pickPending;
        this._pickPending = null;
        const operation = Promise.resolve().then(() =>
            this._pickSingle(request.x, request.y)
        );
        this._pickInFlight = operation;
        operation.then(
            (value) => {
                request.resolve(value);
                this._finishPick(operation);
            },
            (reason) => {
                request.reject(reason);
                this._finishPick(operation);
            }
        );
    }

    /**
     * Complete one readback and service the latest pending request.
     *
     * @param {Promise<unknown>} operation
     * @returns {void}
     */
    _finishPick(operation) {
        if (this._pickInFlight !== operation) {
            return;
        }
        this._pickInFlight = null;
        this._startNextPick();
    }

    /**
     * Performs one serialized pick readback.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Promise<number|null>}
     */
    async _pickSingle(x, y) {
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
        this._assertAlive();
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
        this._assertAlive();
        const draws = this._normalizeDraws(frame.draws ?? this._marks.keys());
        addCount("renderDraws", draws.length);
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

        const encodingStart = startPhase();
        this._encodeDraws(pass, draws, false);
        finishPhase("commandEncoding", encodingStart);

        pass.end();
        const submissionStart = startPhase();
        this.device.queue.submit([commandEncoder.finish()]);
        finishPhase("submission", submissionStart);
        this._renderFrame = draws;
        this._pickingDirty = true;
    }

    /**
     * Replace the ordered draw list used by the on-demand pick pass.
     *
     * @param {import("./index.d.ts").RenderFrame} [frame]
     * @returns {void}
     */
    renderPicking(frame = {}) {
        this._assertAlive();
        this._pickingFrame = frame.draws
            ? this._normalizeDraws(frame.draws)
            : (this._pickingFrame ??
              this._renderFrame ??
              this._normalizeDraws(this._marks.keys()));
        this._pickingDirty = true;
    }

    /**
     * @param {Iterable<import("./index.d.ts").DrawCommand | MarkId>} draws
     * @returns {NormalizedDraw[]}
     */
    _normalizeDraws(draws) {
        const phaseStart = startPhase();
        const canvas = {
            x: 0,
            y: 0,
            width: this._globals.width,
            height: this._globals.height,
        };
        const normalized = Array.from(draws, (draw) => {
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

            let scissor = intersectRects(command.scissor ?? canvas, canvas);
            const firstInstance = command.firstInstance ?? 0;
            assertNonNegativeInteger("firstInstance", firstInstance);
            const instanceCount =
                command.instanceCount ?? mark.drawCount - firstInstance;
            assertNonNegativeInteger("instanceCount", instanceCount);
            if (firstInstance + instanceCount > mark.drawCount) {
                throw new RendererError(
                    `Instance range exceeds mark count: ${mark.drawCount}.`
                );
            }
            const resolvedRange = mark.resolveDrawRange(
                firstInstance,
                instanceCount
            );

            const placementConfig = mark._placementIndex;
            let placement;
            if (placementConfig) {
                if (!command.placement) {
                    throw new RendererError(
                        "Placement-enabled marks require a placement binding."
                    );
                }
                const set = this._placementSets.get(
                    command.placement.set.placementSetId
                );
                if (!set) {
                    throw new RendererError(
                        `No such placement set: ${command.placement.set.placementSetId}`
                    );
                }
                const index = command.placement.index;
                if (
                    "source" in placementConfig &&
                    placementConfig.source === "draw"
                ) {
                    if (!Number.isInteger(index) || index < 0) {
                        throw new RendererError(
                            "Draw placement marks require a non-negative index."
                        );
                    }
                    if (index >= set.count) {
                        throw new RendererError(
                            `Placement index ${index} exceeds set count ${set.count}.`
                        );
                    }
                } else if (index !== undefined) {
                    throw new RendererError(
                        "Per-instance placement marks forbid a draw-level index."
                    );
                }
                placement = {
                    bindGroup: set.bindGroup,
                    count: set.count,
                    index,
                    clipToPlacement: command.placement.clipToPlacement,
                    clipMode: placementClipMode(
                        command.placement.clipToPlacement
                    ),
                };
                if (index !== undefined && placement.clipToPlacement) {
                    const base = index * 4;
                    const rectangles = set._rectangles;
                    const placementRect = {
                        x: viewport.x + rectangles[base] * viewport.width,
                        y: viewport.y + rectangles[base + 1] * viewport.height,
                        width: rectangles[base + 2] * viewport.width,
                        height: rectangles[base + 3] * viewport.height,
                    };
                    const clip = placement.clipToPlacement;
                    scissor = intersectRects(scissor, {
                        x: clip.includes("x") ? placementRect.x : canvas.x,
                        y: clip.includes("y") ? placementRect.y : canvas.y,
                        width: clip.includes("x")
                            ? placementRect.width
                            : canvas.width,
                        height: clip.includes("y")
                            ? placementRect.height
                            : canvas.height,
                    });
                }
            } else if (command.placement) {
                throw new RendererError(
                    "Placement bindings require a placement-enabled mark."
                );
            }

            return {
                markId,
                viewport,
                scissor,
                visibleRange: normalizeVisibleRange(
                    command.visibleRange,
                    canvas
                ),
                firstInstance: resolvedRange.firstInstance,
                instanceCount: resolvedRange.instanceCount,
                placement,
            };
        }).filter((draw) => draw.scissor.width > 0 && draw.scissor.height > 0);
        addCount("normalizedDraws", normalized.length);
        finishPhase("drawNormalization", phaseStart);
        return normalized;
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
            const scissor = toPhysicalScissor(
                draw.scissor,
                dpr,
                this.canvas.width,
                this.canvas.height
            );
            pass.setScissorRect(
                scissor.x,
                scissor.y,
                scissor.width,
                scissor.height
            );
            pass.setBindGroup(0, this._globalBindGroup, [
                i * this._globalUniformStride,
            ]);
            /** @type {import("./index.d.ts").ProgramDrawOptions} */
            const options = {
                firstInstance: draw.firstInstance,
                instanceCount: draw.instanceCount,
            };
            if (draw.placement) {
                options.placement = draw.placement;
            }
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
        if (this._destroyed) {
            return;
        }
        const mark = this._marks.get(markId);
        if (mark) {
            mark.destroy();
            this._marks.delete(markId);
            this.markPickingDirty();
        }
    }

    /**
     * Destroys all renderer-owned GPU resources. Safe to call repeatedly.
     *
     * @returns {void}
     */
    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        for (const mark of this._marks.values()) {
            mark.destroy();
        }
        this._marks.clear();
        for (const set of this._placementSets?.values() ?? []) {
            set.destroy();
        }
        this._placementSets?.clear();
        this._renderFrame = null;
        this._globalUniformBuffer.destroy();
        this._pickTexture?.destroy();
        this._pickTexture = null;
        this._pickTextureView = null;
        this._pickReadbackBuffer?.destroy();
        this._pickReadbackBuffer = null;
        this._pickPending?.resolve(null);
        this._pickPending = null;
        this._onInvalidate = () => {};
        this.context.unconfigure();
        this.device.destroy();
    }

    /**
     * @returns {void}
     */
    _assertAlive() {
        if (this._destroyed) {
            throw new RendererError("Renderer has been destroyed.");
        }
    }
}

/**
 * Adds counters to the browser WebGPU objects only while the private
 * benchmark profiler is active. Assignment is best effort because some
 * implementations expose native methods as non-writable properties.
 *
 * @param {GPUDevice} device
 */
function instrumentGpuDevice(device) {
    if (!getProfiler()?.enabled) {
        return;
    }

    const queue = device.queue;
    wrapMethod(queue, "writeBuffer", (args) => {
        const data = /** @type {{byteLength?: number} | undefined} */ (args[2]);
        const dataOffset = typeof args[3] === "number" ? args[3] : 0;
        const requestedSize = args[4];
        const byteLength =
            typeof requestedSize === "number"
                ? requestedSize
                : Math.max(0, (data?.byteLength ?? 0) - dataOffset);
        addCount("writeBufferCalls");
        addCount("writeBufferBytes", byteLength);
    });
    wrapMethod(queue, "submit", () => addCount("queueSubmissions"));

    wrapMethod(device, "createBuffer", () => addCount("gpuBuffersCreated"));
    wrapMethod(device, "createTexture", () => addCount("gpuTexturesCreated"));
    wrapMethod(device, "createBindGroup", () => addCount("bindGroupsCreated"));
    wrapMethod(device, "createRenderPipeline", () =>
        addCount("pipelinesCreated")
    );
    wrapMethod(device, "createCommandEncoder", () =>
        addCount("commandEncodersCreated")
    );
}

/**
 * @param {object} target
 * @param {string} name
 * @param {(args: unknown[]) => void} before
 */
function wrapMethod(target, name, before) {
    const object = /** @type {Record<string, any>} */ (target);
    const original = /** @type {(...args: any[]) => any} */ (object[name]);
    if (typeof original !== "function") {
        return;
    }
    try {
        /** @param {any[]} args */
        object[name] = function (...args) {
            before(args);
            return original.apply(this, args);
        };
    } catch {
        // Native GPU objects may reject method replacement. Core counters
        // remain available, while unsupported device counters are omitted.
    }
}

/**
 * @typedef {{
 *   markId: import("./index.d.ts").MarkId,
 *   viewport: import("./index.d.ts").DrawRect,
 *   scissor: import("./index.d.ts").DrawRect,
 *   visibleRange: import("./index.d.ts").DrawVisibleRange,
 *   firstInstance: number,
 *   instanceCount: number,
 *   placement?: { bindGroup: GPUBindGroup, count: number, index?: number, clipToPlacement?: "x"|"y"|"xy", clipMode?: number },
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
 * @param {import("./index.d.ts").DrawVisibleRange | undefined} visibleRange
 * @param {import("./index.d.ts").DrawRect} canvas
 * @returns {import("./index.d.ts").DrawVisibleRange}
 */
function normalizeVisibleRange(visibleRange, canvas) {
    if (!visibleRange) {
        return {
            x1: canvas.x,
            y1: canvas.y,
            x2: canvas.x + canvas.width,
            y2: canvas.y + canvas.height,
            cullX: false,
            cullY: false,
        };
    }

    const { x1, y1, x2, y2, cullX, cullY } = visibleRange;
    if (
        !Number.isFinite(x1) ||
        !Number.isFinite(y1) ||
        !Number.isFinite(x2) ||
        !Number.isFinite(y2) ||
        x1 > x2 ||
        y1 > y2 ||
        typeof cullX != "boolean" ||
        typeof cullY != "boolean"
    ) {
        throw new RendererError(
            "visibleRange must have finite ordered bounds and boolean flags."
        );
    }

    return visibleRange;
}

/**
 * @param {import("./index.d.ts").DrawRect} rect
 * @param {import("./index.d.ts").DrawRect} bounds
 * @returns {import("./index.d.ts").DrawRect}
 */
function intersectRects(rect, bounds) {
    if (
        !Number.isFinite(rect.x) ||
        !Number.isFinite(rect.y) ||
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height)
    ) {
        throw new RendererError(
            "scissor must have finite coordinates and positive dimensions."
        );
    }
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: rect.x, y: rect.y, width: 0, height: 0 };
    }
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
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
function toPhysicalScissor(rect, dpr, canvasWidth, canvasHeight) {
    const x = Math.floor(rect.x * dpr);
    const y = Math.floor(rect.y * dpr);
    const right = Math.min(canvasWidth, Math.ceil((rect.x + rect.width) * dpr));
    const bottom = Math.min(
        canvasHeight,
        Math.ceil((rect.y + rect.height) * dpr)
    );
    return { x, y, width: right - x, height: bottom - y };
}
