import {
    globalBindings,
    globalUniformByteSize,
    placementBindings,
} from "./utils/bindingLimits.js";
import { gpuLabel, RENDERER_GPU_OWNER } from "./utils/gpuLabel.js";
import { ProgramTemplateCache } from "./marks/programs/internal/programTemplateCache.js";
import { TextureCompositor, TransientTexturePool } from "./renderGroups.js";
import RenderPassState from "./renderPassState.js";

const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

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
    /** @type {Renderer} */
    #renderer;
    /** @type {string} */
    #labelOwner;

    #destroyed = false;

    /** @type {GPUBuffer} */
    #buffer;

    /** @type {GPUBindGroup} */
    #bindGroup;

    /** @param {Renderer} renderer @param {number} id @param {import("./index.d.ts").PlacementSetData} data */
    constructor(renderer, id, data) {
        this.#renderer = renderer;
        this.placementSetId = id;
        this.#labelOwner = `${RENDERER_GPU_OWNER} placement set #${id}`;

        /** @internal Normalization reads rectangles to clip placed draws. */
        this._rectangles = validatePlacementData(data);
        this.#buffer = createPlacementBuffer(
            renderer.device,
            this._rectangles,
            this.#labelOwner
        );
        this.#bindGroup = this.#createBindGroup();
    }

    get count() {
        return this._rectangles.length / 4;
    }

    get bindGroup() {
        this.#renderer._assertAlive();
        if (this.#destroyed) {
            throw new RendererError("Placement set has been destroyed.");
        }
        return this.#bindGroup;
    }

    #createBindGroup() {
        return this.#renderer.device.createBindGroup({
            label: gpuLabel(this.#labelOwner, "bind group"),
            layout: this.#renderer._placementBindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this.#buffer } }],
        });
    }

    /** @param {import("./index.d.ts").PlacementSetData} data */
    replace(data) {
        this.#renderer._assertAlive();
        if (this.#destroyed) {
            throw new RendererError("Placement set has been destroyed.");
        }
        const rectangles = validatePlacementData(data);
        if (rectangles.byteLength > this.#buffer.size) {
            addCount("placementBufferRecreations");
            const oldBuffer = this.#buffer;
            this.#buffer = createPlacementBuffer(
                this.#renderer.device,
                rectangles,
                this.#labelOwner
            );
            this.#bindGroup = this.#createBindGroup();
            oldBuffer.destroy();
        } else if (rectangles.byteLength) {
            addCount("placementBufferReplacements");
            addCount("placementUploadCalls");
            addCount("placementUploadBytes", rectangles.byteLength);
            this.#renderer.device.queue.writeBuffer(
                this.#buffer,
                0,
                /** @type {Float32Array<ArrayBuffer>} */ (rectangles)
            );
        }
        this._rectangles = rectangles;
        this.#renderer._renderFrame = null;
        this.#renderer._pickingFrame = null;
        addCount("retainedNormalFrameInvalidations");
        addCount("retainedPickingFrameInvalidations");
        this.#renderer.markPickingDirty();
    }

    destroy() {
        if (this.#destroyed) {
            return;
        }
        this.#destroyed = true;
        this.#buffer.destroy();
        this.#renderer._placementSets.delete(this.placementSetId);
        this.#renderer._renderFrame = null;
        this.#renderer._pickingFrame = null;
        this.#renderer.markPickingDirty();
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

/**
 * @param {GPUDevice} device
 * @param {Float32Array} rectangles
 * @param {string} labelOwner
 * @returns {GPUBuffer}
 */
function createPlacementBuffer(device, rectangles, labelOwner) {
    const buffer = device.createBuffer({
        label: gpuLabel(labelOwner, "rectangles"),
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

    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize:
                adapter.limits.maxStorageBufferBindingSize,
            maxBufferSize: adapter.limits.maxBufferSize,
        },
    });
    instrumentGpuDevice(device);
    const context = canvas.getContext("webgpu");
    if (!context) {
        throw new RendererError("Could not create a WebGPU context.");
    }

    const format = options.format ?? navigator.gpu.getPreferredCanvasFormat();

    return new Renderer({
        device,
        context,
        format,
        canvas,
        alphaMode: options.alphaMode ?? "premultiplied",
        onInvalidate: options.onInvalidate,
        onDeviceLoss: options.onDeviceLoss,
    });
}

/**
 * Owns the WebGPU device, global uniforms, and mark programs.
 */
export class Renderer {
    /** @type {() => void} */
    #onInvalidate;

    /** @type {(info: GPUDeviceLostInfo) => void} */
    #onDeviceLoss;

    /** @type {"alive" | "lost" | "destroyed"} */
    #state = "alive";

    /** @type {RendererError | null} */
    #deviceLossError = null;

    /** @type {Set<import("./index.d.ts").DetachedTargetHandle>} */
    #detachedTargets = new Set();

    /** @type {TransientTexturePool} */
    #transientTextures;

    /** @type {TextureCompositor} */
    #textureCompositor;

    /** @type {Set<{ destroy: () => void }>} */
    #ownedResources = new Set();

    #nextMarkId = 1;

    #nextPlacementSetId = 1;

    #pickingDirty = true;

    /** @type {GPUTexture | null} */
    #pickTexture = null;

    /** @type {GPUTextureView | null} */
    #pickTextureView = null;

    /** @type {GPUBuffer | null} */
    #pickReadbackBuffer = null;

    /** @type {{ width: number, height: number }} */
    #pickTextureSize = { width: 0, height: 0 };

    /**
     * @type {{ x: number, y: number, resolve: (value: number|null) => void, reject: (reason: unknown) => void }[]}
     */
    #pickQueue = [];

    /** @type {{ x: number, y: number, resolve: (value: number|null) => void, reject: (reason: unknown) => void } | null} */
    #activePick = null;

    /** @type {number} */
    #globalUniformStride;

    #globalUniformCapacity = 1;

    /** @type {ReturnType<typeof createGlobalUniformStaging>} */
    #globalUniformStaging;

    /** @type {GPUBuffer} */
    #globalUniformBuffer;

    /** @type {GPUBindGroup} */
    #globalBindGroup;

    /**
     * @typedef {import("./index.d.ts").MarkId} MarkId
     * @typedef {import("./index.d.ts").TypedArray} TypedArray
     */

    /**
     * @param {{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, canvas: HTMLCanvasElement, alphaMode: GPUCanvasAlphaMode, onInvalidate?: () => void, onDeviceLoss?: (info: GPUDeviceLostInfo) => void }} params
     */
    constructor({
        device,
        context,
        format,
        canvas,
        alphaMode,
        onInvalidate,
        onDeviceLoss,
    }) {
        this.device = device;
        this.context = context;
        this.format = format;
        this.canvas = canvas;
        this.alphaMode = alphaMode;
        this.#onInvalidate = onInvalidate ?? (() => {});
        this.#onDeviceLoss = onDeviceLoss ?? (() => {});

        void device.lost.then((info) => this.#handleDeviceLoss(info));

        context.configure({ device, format, alphaMode });
        // TODO: Use r32uint picking when available on all targets.
        this.pickFormat = /** @type {GPUTextureFormat} */ ("rgba8unorm");

        /**
         * @type {Map<MarkId, import("./index.d.ts").MarkProgram>}
         * @internal Development GPU checks and benchmarks inspect mark programs.
         */
        this._marks = new Map();
        /**
         * @type {Map<number, PlacementSet>}
         * @internal Placement handles remove themselves from this map on destruction.
         */
        this._placementSets = new Map();

        /** @internal Shared immutable programs used by BaseProgram. */
        this._programTemplateCache = new ProgramTemplateCache(addCount);
        this.#transientTextures = new TransientTexturePool(device, format);
        this.#textureCompositor = new TextureCompositor(device, format);

        /**
         * @type {NormalizedDraw[] | null}
         * @internal Placement handles invalidate retained frames when their rectangles change.
         */
        this._renderFrame = null;
        /**
         * @type {NormalizedDraw[] | null}
         * @internal Placement handles invalidate retained frames when their rectangles change.
         */
        this._pickingFrame = null;

        this.#globalUniformStride = Math.max(
            globalUniformByteSize,
            device.limits.minUniformBufferOffsetAlignment
        );

        this.#globalUniformStaging = createGlobalUniformStaging(
            this.#globalUniformStride
        );

        // Each occurrence gets viewport-local globals at a dynamic offset.
        this.#globalUniformBuffer = device.createBuffer({
            label: gpuLabel(RENDERER_GPU_OWNER, "global uniforms"),
            size: this.#globalUniformStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Bind group 0 is reserved for global uniforms.
        /** @internal Shader layout shared with mark programs. */
        this._globalBindGroupLayout = device.createBindGroupLayout({
            label: gpuLabel(RENDERER_GPU_OWNER, "global bind group layout"),
            entries: globalBindings,
        });

        this.#globalBindGroup = device.createBindGroup({
            label: gpuLabel(RENDERER_GPU_OWNER, "global bind group"),
            layout: this._globalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.#globalUniformBuffer,
                        size: globalUniformByteSize,
                    },
                },
            ],
        });

        /** @internal Shader layout shared with marks and placement handles. */
        this._placementBindGroupLayout = device.createBindGroupLayout({
            label: gpuLabel(RENDERER_GPU_OWNER, "placement bind group layout"),
            entries: placementBindings,
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
        /**
         * @type {import("./index.d.ts").GlobalUniforms}
         * @internal Used by marks for default scale ranges and text sizing.
         */
        this._globals = validateGlobals(globals);
        this.markPickingDirty();
    }

    /**
     * Creates an independently sized canvas target that shares this renderer's
     * device and retained resources.
     *
     * @param {HTMLCanvasElement} canvas
     * @param {import("./index.d.ts").GlobalUniforms} globals
     * @returns {import("./index.d.ts").DetachedTargetHandle}
     */
    createDetachedTarget(canvas, globals) {
        this._assertAlive();
        const context = canvas.getContext("webgpu");
        if (!context) {
            throw new RendererError(
                "Could not create a detached WebGPU context."
            );
        }
        context.configure({
            device: this.device,
            format: this.format,
            alphaMode: this.alphaMode,
        });
        const targetGlobals = validateGlobals(globals);
        let destroyed = false;
        const assertAlive = () => {
            this._assertAlive();
            if (destroyed) {
                throw new RendererError(
                    "Detached render target has been destroyed."
                );
            }
        };
        /** @type {import("./index.d.ts").DetachedTargetHandle} */
        const target = {
            canvas,
            render: (frame = {}) => {
                assertAlive();
                this.#renderTarget(
                    context,
                    canvas,
                    targetGlobals,
                    frame,
                    false
                );
            },
            onSubmittedWorkDone: async () => {
                assertAlive();
                await this.device.queue.onSubmittedWorkDone();
            },
            destroy: () => {
                if (!destroyed) {
                    destroyed = true;
                    context.unconfigure();
                    this.#detachedTargets.delete(target);
                }
            },
        };
        this.#detachedTargets.add(target);
        return target;
    }

    /**
     * @param {number} drawCount
     * @returns {void}
     */
    #ensureGlobalUniformCapacity(drawCount) {
        if (drawCount <= this.#globalUniformCapacity) {
            return;
        }

        let capacity = this.#globalUniformCapacity;
        while (capacity < drawCount) {
            capacity *= 2;
        }

        const oldBuffer = this.#globalUniformBuffer;
        this.#globalUniformBuffer = this.device.createBuffer({
            label: gpuLabel(RENDERER_GPU_OWNER, "global uniforms"),
            size: capacity * this.#globalUniformStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#globalUniformStaging = createGlobalUniformStaging(
            capacity * this.#globalUniformStride
        );
        this.#globalBindGroup = this.device.createBindGroup({
            label: gpuLabel(RENDERER_GPU_OWNER, "global bind group"),
            layout: this._globalBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.#globalUniformBuffer,
                        size: globalUniformByteSize,
                    },
                },
            ],
        });
        this.#globalUniformCapacity = capacity;
        oldBuffer.destroy();
    }

    /**
     * @param {NormalizedDraw} draw
     * @param {RenderTarget} target
     * @param {import("./index.d.ts").DrawRect} viewport Physical, target-local viewport.
     * @param {boolean} picking
     */
    #stageDrawGlobals(draw, target, viewport, picking) {
        const { floats, integers } = this.#globalUniformStaging;
        const offset = (draw.uniformIndex * this.#globalUniformStride) / 4;
        const dpr = this._globals.dpr;
        const scaleX = (draw.viewport.width * dpr) / viewport.width;
        const scaleY = (draw.viewport.height * dpr) / viewport.height;
        const offsetX =
            ((draw.viewport.x - target.logicalX) * dpr - viewport.x) /
            viewport.width;
        const offsetY =
            ((draw.viewport.y - target.logicalY) * dpr - viewport.y) /
            viewport.height;

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
        integers[offset + 19] = picking ? 0 : draw.orderPass;
        floats[offset + 20] = target.logicalX;
        floats[offset + 21] = target.logicalY;
        floats[offset + 22] = scaleX;
        floats[offset + 23] = scaleY;
        floats[offset + 24] = offsetX * 2 + scaleX - 1;
        floats[offset + 25] = -offsetY * 2 - scaleY + 1;
    }

    /** @param {number} drawCount */
    #uploadDrawGlobals(drawCount) {
        const phaseStart = startPhase();
        if (!drawCount) {
            finishPhase("drawGlobals", phaseStart);
            return;
        }

        this.device.queue.writeBuffer(
            this.#globalUniformBuffer,
            0,
            this.#globalUniformStaging.buffer,
            0,
            drawCount * this.#globalUniformStride
        );
        addCount("drawGlobalWrites");
        addCount("drawGlobalBytes", drawCount * this.#globalUniformStride);
        finishPhase("drawGlobals", phaseStart);
    }

    /**
     * @template TConfig
     * @template {Record<string, import("./index.d.ts").SeriesData>} TSeries
     * @template {object} TProperties
     * @param {import("./index.d.ts").MarkDefinition<TConfig, TSeries, TProperties>} definition
     * @param {TConfig} config
     * @param {import("./index.d.ts").MarkCreationOptions} [options]
     * @returns {import("./index.d.ts").MarkHandle<TSeries, TProperties>}
     */
    createMark(definition, config, options = {}) {
        this._assertAlive();
        const markId = /** @type {MarkId} */ (this.#nextMarkId++);
        const label = options.label ?? `${definition.type} #${markId}`;
        const mark = definition.createProgram(this, config, { label });

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
        const set = new PlacementSet(this, this.#nextPlacementSetId++, data);
        this._placementSets.set(set.placementSetId, set);
        return set;
    }

    /**
     * @returns {void}
     */
    markPickingDirty() {
        if (this.#state !== "alive") {
            return;
        }
        this.#pickingDirty = true;
    }

    /**
     * Signals that asynchronous resource preparation changed visible output.
     * The host remains responsible for submitting the next frame.
     *
     * @returns {void}
     * @internal Renderer-owned resources and marks share this lifecycle contract.
     */
    _invalidate() {
        if (this.#state !== "alive") {
            return;
        }
        this.markPickingDirty();
        this.#onInvalidate();
    }

    /**
     * Retain a lazily imported device resource until renderer destruction.
     *
     * @template {{ destroy: () => void }} T
     * @param {T} resource
     * @returns {T}
     * @internal Renderer-owned resources and marks share this lifecycle contract.
     */
    _ownResource(resource) {
        this._assertAlive();
        this.#ownedResources.add(resource);
        return resource;
    }

    /**
     * @returns {void}
     */
    #ensurePickTarget() {
        const width = Math.max(1, this.canvas.width);
        const height = Math.max(1, this.canvas.height);
        const needsResize =
            !this.#pickTexture ||
            this.#pickTextureSize.width !== width ||
            this.#pickTextureSize.height !== height;

        if (!needsResize) {
            return;
        }

        this.#pickTexture?.destroy();
        this.#pickTexture = this.device.createTexture({
            label: gpuLabel(RENDERER_GPU_OWNER, "picking texture"),
            size: { width, height },
            format: this.pickFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this.#pickTextureView = this.#pickTexture.createView({
            label: gpuLabel(RENDERER_GPU_OWNER, "picking texture view"),
        });
        this.#pickTextureSize = { width, height };
        this.#pickReadbackBuffer?.destroy();
        this.#pickReadbackBuffer = this.device.createBuffer({
            label: gpuLabel(RENDERER_GPU_OWNER, "picking readback"),
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    /**
     * @returns {void}
     */
    #renderPick() {
        addCount("pickingRenders");
        this.#ensurePickTarget();
        const commandEncoder = this.device.createCommandEncoder({
            label: gpuLabel(RENDERER_GPU_OWNER, "picking command encoder"),
        });
        const pass = commandEncoder.beginRenderPass({
            label: gpuLabel(RENDERER_GPU_OWNER, "picking render pass"),
            colorAttachments: [
                {
                    view: this.#pickTextureView,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                },
            ],
        });

        const draws =
            this._pickingFrame ??
            this._renderFrame ??
            this.#normalizeDraws(this._marks.keys());
        this.#ensureGlobalUniformCapacity(draws.length);
        this.#encodeDraws(pass, draws, true);
        this.#uploadDrawGlobals(draws.length);

        pass.end();
        this.device.queue.submit([commandEncoder.finish()]);
        this.#pickingDirty = false;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {Promise<number|null>}
     */
    pick(x, y) {
        this._assertAlive();
        return new Promise((resolve, reject) => {
            this.#pickQueue.push({ x, y, resolve, reject });
            this.#startNextPick();
        });
    }

    /**
     * Start the next queued pick when no GPU readback is in flight.
     *
     * @returns {void}
     */
    #startNextPick() {
        if (this.#activePick || !this.#pickQueue.length) {
            return;
        }

        const request = this.#pickQueue.shift();
        this.#activePick = request;
        const operation = Promise.resolve().then(() => {
            this._assertAlive();
            return this.#pickSingle(request.x, request.y);
        });
        operation.then(
            (value) => this.#finishPick(request, value, false),
            (reason) => this.#finishPick(request, reason, true)
        );
    }

    /**
     * Complete one readback and service the next pending request.
     *
     * @param {{ resolve: (value: number|null) => void, reject: (reason: unknown) => void }} request
     * @param {unknown} result
     * @param {boolean} rejected
     * @returns {void}
     */
    #finishPick(request, result, rejected) {
        if (this.#activePick !== request) {
            return;
        }
        this.#activePick = null;
        if (rejected) {
            request.reject(result);
        } else {
            request.resolve(/** @type {number | null} */ (result));
        }
        if (this.#state === "alive") {
            this.#startNextPick();
        }
    }

    /**
     * Transition once to the terminal lost state and settle pending work.
     *
     * @param {GPUDeviceLostInfo} info
     * @returns {void}
     */
    #handleDeviceLoss(info) {
        if (this.#state !== "alive") {
            return;
        }
        const detail = info.message ? `: ${info.message}` : "";
        const error = new RendererError(
            `WebGPU device was lost (${info.reason})${detail}`
        );
        this.#state = "lost";
        this.#deviceLossError = error;
        const active = this.#activePick;
        this.#activePick = null;
        active?.reject(error);
        for (const request of this.#pickQueue) {
            request.reject(error);
        }
        this.#pickQueue.length = 0;
        this.#onInvalidate = () => {};
        this.#onDeviceLoss(info);
    }

    /**
     * Performs one serialized pick readback.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Promise<number|null>}
     */
    async #pickSingle(x, y) {
        if (!this._marks.size) {
            return null;
        }
        this.#ensurePickTarget();
        if (this.#pickingDirty) {
            this.#renderPick();
        }

        const dpr = this._globals.dpr;
        const px = Math.floor(x * dpr);
        const py = Math.floor(y * dpr);
        if (
            px < 0 ||
            py < 0 ||
            px >= this.#pickTextureSize.width ||
            py >= this.#pickTextureSize.height
        ) {
            return null;
        }

        const commandEncoder = this.device.createCommandEncoder({
            label: gpuLabel(
                RENDERER_GPU_OWNER,
                "pick readback command encoder"
            ),
        });
        commandEncoder.copyTextureToBuffer(
            {
                texture: this.#pickTexture,
                origin: { x: px, y: py },
            },
            {
                buffer: this.#pickReadbackBuffer,
                bytesPerRow: 256,
            },
            { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await this.#pickReadbackBuffer.mapAsync(GPUMapMode.READ, 0, 4);
        const data = new Uint8Array(
            this.#pickReadbackBuffer.getMappedRange(0, 4)
        );
        const id = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
        this.#pickReadbackBuffer.unmap();
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
        this.#renderTarget(
            this.context,
            this.canvas,
            this._globals,
            frame,
            true
        );
    }

    /**
     * @param {GPUCanvasContext} context
     * @param {HTMLCanvasElement} canvas
     * @param {import("./index.d.ts").GlobalUniforms} globals
     * @param {import("./index.d.ts").RenderFrame} frame
     * @param {boolean} rememberFrame
     */
    #renderTarget(context, canvas, globals, frame, rememberFrame) {
        const previousGlobals =
            /** @type {import("./index.d.ts").GlobalUniforms} */ (
                this._globals
            );
        this._globals = globals;
        try {
            this.#renderTargetFrame(context, canvas, frame, rememberFrame);
        } finally {
            this._globals = previousGlobals;
        }
    }

    /**
     * @param {GPUCanvasContext} context
     * @param {HTMLCanvasElement} canvas
     * @param {import("./index.d.ts").RenderFrame} frame
     * @param {boolean} rememberFrame
     */
    #renderTargetFrame(context, canvas, frame, rememberFrame) {
        const { items, draws, groupCount } = this.#normalizeRenderItems(
            frame.items ?? frame.draws ?? this._marks.keys()
        );
        addCount("renderDraws", draws.length);
        addCount("renderGroups", groupCount);
        this.#ensureGlobalUniformCapacity(draws.length);
        this.#textureCompositor.prepare(draws.length + groupCount + 1);
        const commandEncoder = this.device.createCommandEncoder({
            label: gpuLabel(RENDERER_GPU_OWNER, "main command encoder"),
        });
        const view = context.getCurrentTexture().createView({
            label: gpuLabel(RENDERER_GPU_OWNER, "canvas texture view"),
        });

        this.#transientTextures.beginFrame();
        try {
            const encodingStart = startPhase();
            this.#encodeRenderItems(
                commandEncoder,
                {
                    view,
                    width: canvas.width,
                    height: canvas.height,
                    logicalX: 0,
                    logicalY: 0,
                    label: RENDERER_GPU_OWNER,
                },
                items,
                1,
                frame.clearColor ?? { r: 1, g: 1, b: 1, a: 1 }
            );
            this.#uploadDrawGlobals(draws.length);
            this.#textureCompositor.flush();
            finishPhase("commandEncoding", encodingStart);
            const submissionStart = startPhase();
            this.device.queue.submit([commandEncoder.finish()]);
            finishPhase("submission", submissionStart);
        } finally {
            this.#transientTextures.endFrame();
        }
        if (rememberFrame) {
            this._renderFrame = draws;
            this.#pickingDirty = true;
        }
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
            ? this.#normalizeDraws(frame.draws)
            : (this._pickingFrame ??
              this._renderFrame ??
              this.#normalizeDraws(this._marks.keys()));
        this.#pickingDirty = true;
    }

    /**
     * @param {Iterable<import("./index.d.ts").DrawCommand | MarkId>} draws
     * @returns {NormalizedDraw[]}
     */
    #normalizeDraws(draws) {
        const phaseStart = startPhase();
        const canvas = {
            x: 0,
            y: 0,
            width: this._globals.width,
            height: this._globals.height,
        };
        /** @type {NormalizedDraw[]} */
        const normalized = [];
        for (const draw of draws) {
            const normalizedDraw = this.#normalizeDraw(
                draw,
                canvas,
                normalized.length
            );
            if (normalizedDraw) {
                normalized.push(normalizedDraw);
            }
        }
        addCount("normalizedDraws", normalized.length);
        finishPhase("drawNormalization", phaseStart);
        return normalized;
    }

    /**
     * @param {import("./index.d.ts").DrawCommand | MarkId} draw
     * @param {import("./index.d.ts").DrawRect} canvas
     * @param {number} uniformIndex
     * @returns {NormalizedDraw | undefined}
     */
    #normalizeDraw(draw, canvas, uniformIndex) {
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
                clipMode: placementClipMode(command.placement.clipToPlacement),
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

        if (scissor.width <= 0 || scissor.height <= 0) {
            return undefined;
        }
        return {
            type: /** @type {"draw"} */ ("draw"),
            requiredSampleCount: mark.antialiasing === "multisample" ? 4 : 1,
            uniformIndex,
            markId,
            viewport,
            scissor,
            visibleRange: normalizeVisibleRange(command.visibleRange, canvas),
            firstInstance: resolvedRange.firstInstance,
            instanceCount: resolvedRange.instanceCount,
            // Low bits select the partition; bit 2 identifies the second visual pass.
            orderPass: 0,
            placement,
        };
    }

    /**
     * @param {Iterable<import("./index.d.ts").RenderItem | MarkId>} items
     * @returns {{items: NormalizedRenderItem[], draws: NormalizedDraw[], groupCount: number}}
     */
    #normalizeRenderItems(items) {
        const phaseStart = startPhase();
        // TODO: If normalization becomes costly, retain semantic topology with
        // slots for live opacity and bounds. Physical layerization must still
        // run when opacity changes between zero, one, and fractional values.
        const canvas = {
            x: 0,
            y: 0,
            width: this._globals.width,
            height: this._globals.height,
        };
        /** @type {NormalizedDraw[]} */
        const draws = [];
        let groupCount = 0;

        /**
         * @param {Iterable<import("./index.d.ts").RenderItem | MarkId>} source
         * @returns {NormalizedSemanticItem[]}
         */
        const normalize = (source) => {
            /** @type {NormalizedSemanticItem[]} */
            const normalized = [];
            for (const item of source) {
                if (isRenderScope(item)) {
                    const opacity = Math.min(1, Math.max(0, item.opacity ?? 1));
                    if (Number.isNaN(opacity)) {
                        throw new RendererError(
                            "Render scope opacity must be a number."
                        );
                    }
                    assertRect("render scope bounds", item.bounds, true);
                    if (
                        opacity === 0 ||
                        item.bounds.width === 0 ||
                        item.bounds.height === 0
                    ) {
                        continue;
                    }
                    const children = normalize(item.items);
                    if (!children.length) {
                        continue;
                    }
                    normalized.push({
                        type: "scope",
                        bounds: item.bounds,
                        opacity,
                        label: item.label,
                        coverageOnly: children.every(requiresMultisampling),
                        items: children,
                    });
                } else {
                    const draw = this.#normalizeDraw(
                        item,
                        canvas,
                        draws.length
                    );
                    if (draw) {
                        const mark = this._marks.get(draw.markId);
                        const order = mark._order;
                        draws.push(draw);
                        normalized.push(draw);
                        if (order && mark._orderActive) {
                            const matchingFirst = order.matching === "first";
                            const firstPass = matchingFirst ? 1 : 2;
                            const secondPass = (matchingFirst ? 2 : 1) | 4;
                            draw.orderPass = firstPass;
                            const secondDraw = {
                                ...draw,
                                uniformIndex: draws.length,
                                orderPass: secondPass,
                            };
                            draws.push(secondDraw);
                            normalized.push(secondDraw);
                        }
                    }
                }
            }
            return normalized;
        };

        /**
         * @param {NormalizedSemanticItem[]} source
         * @param {1 | 4} targetSampleCount
         * @param {import("./index.d.ts").DrawRect} activeBounds
         * @param {string} label
         * @returns {NormalizedRenderItem[]}
         */
        const layerize = (source, targetSampleCount, activeBounds, label) => {
            /** @type {NormalizedRenderItem[]} */
            const normalized = [];
            /** @type {NormalizedDraw[]} */
            let coverageRun = [];
            /** @type {import("./index.d.ts").DrawRect | undefined} */
            let coverageBounds;

            const flushCoverageRun = () => {
                if (!coverageRun.length) {
                    return;
                }
                groupCount++;
                normalized.push({
                    type: "group",
                    bounds: /** @type {import("./index.d.ts").DrawRect} */ (
                        coverageBounds
                    ),
                    opacity: 1,
                    sampleCount: 4,
                    label,
                    items: coverageRun,
                });
                coverageRun = [];
                coverageBounds = undefined;
            };

            for (const item of source) {
                if (item.type === "scope") {
                    flushCoverageRun();
                    const bounds = intersectRects(item.bounds, activeBounds);
                    if (!bounds.width || !bounds.height) {
                        continue;
                    }
                    const sampleCount = item.coverageOnly ? 4 : 1;
                    const scopeLabel = item.label ?? label;
                    const children = layerize(
                        item.items,
                        sampleCount,
                        bounds,
                        scopeLabel
                    );
                    if (!children.length) {
                        continue;
                    }
                    if (
                        item.opacity === 1 &&
                        sampleCount === targetSampleCount
                    ) {
                        normalized.push(...children);
                    } else {
                        groupCount++;
                        normalized.push({
                            type: "group",
                            bounds,
                            opacity: item.opacity,
                            sampleCount,
                            label: scopeLabel,
                            items: children,
                        });
                    }
                } else {
                    if (
                        targetSampleCount === 1 &&
                        item.requiredSampleCount === 4
                    ) {
                        const bounds = intersectRects(
                            item.scissor,
                            activeBounds
                        );
                        if (!bounds.width || !bounds.height) {
                            continue;
                        }
                        coverageRun.push(item);
                        if (coverageBounds) {
                            expandRect(coverageBounds, bounds);
                        } else {
                            coverageBounds = bounds;
                        }
                    } else {
                        flushCoverageRun();
                        normalized.push(item);
                    }
                }
            }
            flushCoverageRun();
            return normalized;
        };

        const normalizedItems = layerize(
            normalize(items),
            1,
            canvas,
            RENDERER_GPU_OWNER
        );
        addCount("normalizedDraws", draws.length);
        finishPhase("drawNormalization", phaseStart);
        return { items: normalizedItems, draws, groupCount };
    }

    /**
     * Encodes ordered items into a single-sampled accumulation target.
     *
     * @param {GPUCommandEncoder} commandEncoder
     * @param {RenderTarget} target
     * @param {NormalizedRenderItem[]} items
     * @param {1 | 4} sampleCount
     * @param {GPUColor} clearValue
     */
    #encodeRenderItems(commandEncoder, target, items, sampleCount, clearValue) {
        let initialized = false;
        /** @type {NormalizedDraw[]} */
        let pending = [];

        const flush = () => {
            if (!pending.length) {
                return;
            }
            if (sampleCount === 1) {
                this.#encodeDrawPass(
                    commandEncoder,
                    target,
                    pending,
                    initialized ? undefined : clearValue
                );
            } else if (!initialized) {
                this.#encodeMultisampleDrawPass(
                    commandEncoder,
                    target,
                    pending
                );
            } else {
                const texture = this.#transientTextures.acquire(
                    target.width,
                    target.height,
                    1
                );
                const chunk = { texture, ...target, view: texture.view };
                this.#encodeMultisampleDrawPass(commandEncoder, chunk, pending);
                this.#encodeCompositePass(
                    commandEncoder,
                    target,
                    chunk,
                    1,
                    initialized ? undefined : clearValue
                );
                this.#transientTextures.release(chunk.texture);
            }
            initialized = true;
            pending = [];
        };

        for (const item of items) {
            if (item.type === "group") {
                flush();
                const group = this.#renderGroup(commandEncoder, target, item);
                if (group) {
                    this.#encodeCompositePass(
                        commandEncoder,
                        target,
                        group,
                        item.opacity,
                        initialized ? undefined : clearValue
                    );
                    this.#transientTextures.release(group.texture);
                    initialized = true;
                }
            } else {
                pending.push(item);
            }
        }
        flush();

        if (!initialized) {
            this.#encodeDrawPass(commandEncoder, target, [], clearValue);
        }
    }

    /**
     * @param {GPUCommandEncoder} commandEncoder
     * @param {RenderTarget} parent
     * @param {NormalizedRenderGroup} group
     * @returns {RenderedGroup | undefined}
     */
    #renderGroup(commandEncoder, parent, group) {
        const clippedBounds = intersectRects(group.bounds, {
            x: parent.logicalX,
            y: parent.logicalY,
            width: parent.width / this._globals.dpr,
            height: parent.height / this._globals.dpr,
        });
        const dpr = this._globals.dpr;
        const bounds = toPhysicalScissor(
            clippedBounds,
            dpr,
            Math.floor(parent.logicalX * dpr) + parent.width,
            Math.floor(parent.logicalY * dpr) + parent.height
        );
        if (!bounds.width || !bounds.height) {
            return undefined;
        }
        const texture = this.#transientTextures.acquire(
            bounds.width,
            bounds.height,
            1
        );
        const target = {
            view: texture.view,
            width: bounds.width,
            height: bounds.height,
            logicalX: bounds.x / dpr,
            logicalY: bounds.y / dpr,
            label: group.label,
        };
        this.#encodeRenderItems(
            commandEncoder,
            target,
            group.items,
            group.sampleCount,
            TRANSPARENT
        );
        return { texture, ...target };
    }

    /**
     * @param {GPUCommandEncoder} commandEncoder
     * @param {RenderTarget} target
     * @param {NormalizedDraw[]} draws
     */
    #encodeMultisampleDrawPass(commandEncoder, target, draws) {
        const multisampled = this.#transientTextures.acquire(
            target.width,
            target.height,
            4
        );
        const pass = commandEncoder.beginRenderPass({
            label: gpuLabel(target.label, "multisample group pass"),
            colorAttachments: [
                {
                    view: multisampled.view,
                    resolveTarget: target.view,
                    clearValue: TRANSPARENT,
                    loadOp: "clear",
                    storeOp: "discard",
                },
            ],
        });
        this.#encodeDraws(pass, draws, false, target, 4);
        pass.end();
        this.#transientTextures.release(multisampled);
    }

    /**
     * @param {GPUCommandEncoder} commandEncoder
     * @param {RenderTarget} target
     * @param {NormalizedDraw[]} draws
     * @param {GPUColor} [clearValue]
     */
    #encodeDrawPass(commandEncoder, target, draws, clearValue) {
        const pass = commandEncoder.beginRenderPass({
            label: gpuLabel(target.label, "main render pass"),
            colorAttachments: [
                {
                    view: target.view,
                    ...(clearValue ? { clearValue } : {}),
                    loadOp: clearValue ? "clear" : "load",
                    storeOp: "store",
                },
            ],
        });
        this.#encodeDraws(pass, draws, false, target);
        pass.end();
    }

    /**
     * @param {GPUCommandEncoder} commandEncoder
     * @param {RenderTarget} target
     * @param {RenderedGroup} source
     * @param {number} opacity
     * @param {GPUColor} [clearValue]
     */
    #encodeCompositePass(commandEncoder, target, source, opacity, clearValue) {
        const pass = commandEncoder.beginRenderPass({
            label: gpuLabel(source.label, "group composite pass"),
            colorAttachments: [
                {
                    view: target.view,
                    ...(clearValue ? { clearValue } : {}),
                    loadOp: clearValue ? "clear" : "load",
                    storeOp: "store",
                },
            ],
        });
        const x = Math.round(
            (source.logicalX - target.logicalX) * this._globals.dpr
        );
        const y = Math.round(
            (source.logicalY - target.logicalY) * this._globals.dpr
        );
        pass.setViewport(x, y, source.width, source.height, 0, 1);
        pass.setScissorRect(x, y, source.width, source.height);
        pass.setPipeline(this.#textureCompositor.pipeline);
        this.#textureCompositor.bind(pass, source.texture, opacity);
        pass.draw(6);
        pass.end();
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {NormalizedDraw[]} draws
     * @param {boolean} picking
     * @param {RenderTarget} [target]
     * @param {1 | 4} [sampleCount]
     * @returns {void}
     */
    #encodeDraws(
        pass,
        draws,
        picking,
        target = {
            view: /** @type {GPUTextureView | undefined} */ (undefined),
            width: this.canvas.width,
            height: this.canvas.height,
            logicalX: 0,
            logicalY: 0,
            label: RENDERER_GPU_OWNER,
        },
        sampleCount = 1
    ) {
        const dpr = this._globals.dpr;
        const state = new RenderPassState(pass);
        const targetBounds = {
            x: target.logicalX,
            y: target.logicalY,
            width: target.width / dpr,
            height: target.height / dpr,
        };
        for (const draw of draws) {
            if (picking && draw.orderPass & 4) {
                continue;
            }
            const mark = this._marks.get(draw.markId);
            if (!mark) {
                continue;
            }

            const viewport = intersectRects(draw.viewport, targetBounds);
            if (!viewport.width || !viewport.height) {
                continue;
            }
            viewport.x = Math.max(0, (viewport.x - target.logicalX) * dpr);
            viewport.y = Math.max(0, (viewport.y - target.logicalY) * dpr);
            viewport.width = Math.min(
                target.width - viewport.x,
                viewport.width * dpr
            );
            viewport.height = Math.min(
                target.height - viewport.y,
                viewport.height * dpr
            );
            state.setViewport(
                viewport.x,
                viewport.y,
                viewport.width,
                viewport.height,
                0,
                1
            );
            this.#stageDrawGlobals(draw, target, viewport, picking);
            const targetScissor = intersectRects(draw.scissor, targetBounds);
            const scissor = toPhysicalScissor(
                targetScissor,
                dpr,
                Math.floor(target.logicalX * dpr) + target.width,
                Math.floor(target.logicalY * dpr) + target.height
            );
            state.setScissorRect(
                scissor.x - Math.floor(target.logicalX * dpr),
                scissor.y - Math.floor(target.logicalY * dpr),
                scissor.width,
                scissor.height
            );
            state.setBindGroup(0, this.#globalBindGroup, [
                draw.uniformIndex * this.#globalUniformStride,
            ]);
            /** @type {import("./index.d.ts").ProgramDrawOptions} */
            const options = {
                firstInstance: draw.firstInstance,
                instanceCount: draw.instanceCount,
                sampleCount,
            };
            if (draw.placement) {
                options.placement = draw.placement;
            }
            if (picking) {
                mark.preparePick(state, options);
            } else {
                mark.prepareDraw(state, options);
            }
            if (draw.placement) {
                state.setBindGroup(2, draw.placement.bindGroup);
            }
            mark.draw(pass, options);
        }
    }

    /**
     * @param {MarkId} markId
     * @returns {void}
     */
    destroyMark(markId) {
        if (this.#state === "destroyed") {
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
        if (this.#state === "destroyed") {
            return;
        }
        this.#state = "destroyed";
        for (const mark of this._marks.values()) {
            mark.destroy();
        }
        this._marks.clear();
        for (const set of this._placementSets.values()) {
            set.destroy();
        }
        this._placementSets.clear();
        for (const target of this.#detachedTargets) {
            target.destroy();
        }
        for (const resource of this.#ownedResources) {
            resource.destroy();
        }
        this.#ownedResources.clear();
        this._renderFrame = null;
        this.#globalUniformBuffer.destroy();
        this.#transientTextures.destroy();
        this.#textureCompositor.destroy();
        this.#pickTexture?.destroy();
        this.#pickTexture = null;
        this.#pickTextureView = null;
        this.#pickReadbackBuffer?.destroy();
        this.#pickReadbackBuffer = null;
        for (const request of this.#pickQueue) {
            request.resolve(null);
        }
        this.#pickQueue.length = 0;
        const active = this.#activePick;
        this.#activePick = null;
        active?.resolve(null);
        this.#onInvalidate = () => {};
        this.context.unconfigure();
        this.device.destroy();
    }

    /**
     * @returns {void}
     * @internal Renderer-owned resources and marks share this lifecycle contract.
     */
    _assertAlive() {
        if (this.#state === "lost") {
            throw this.#deviceLossError;
        }
        if (this.#state === "destroyed") {
            throw new RendererError("Renderer has been destroyed.");
        }
    }
}

/**
 * @param {import("./index.d.ts").GlobalUniforms} globals
 * @returns {import("./index.d.ts").GlobalUniforms}
 */
function validateGlobals(globals) {
    const { width, height, dpr } = globals;
    assertPositiveFinite("width", width);
    assertPositiveFinite("height", height);
    assertPositiveFinite("dpr", dpr);
    return { width, height, dpr };
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
    wrapMethod(device, "createShaderModule", () =>
        addCount("shaderModulesCreated")
    );
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
 *   type: "draw",
 *   requiredSampleCount: 1 | 4,
 *   markId: import("./index.d.ts").MarkId,
 *   viewport: import("./index.d.ts").DrawRect,
 *   scissor: import("./index.d.ts").DrawRect,
 *   visibleRange: import("./index.d.ts").DrawVisibleRange,
 *   uniformIndex: number,
 *   firstInstance: number,
 *   instanceCount: number,
 *   orderPass: number,
 *   placement?: { bindGroup: GPUBindGroup, count: number, index?: number, clipToPlacement?: "x"|"y"|"xy", clipMode?: number },
 * }} NormalizedDraw
 */

/**
 * @typedef {object} NormalizedRenderGroup
 * @property {"group"} type
 * @property {import("./index.d.ts").DrawRect} bounds
 * @property {number} opacity
 * @property {1 | 4} sampleCount
 * @property {string} label
 * @property {NormalizedRenderItem[]} items
 */

/** @typedef {NormalizedDraw | NormalizedRenderGroup} NormalizedRenderItem */

/**
 * @typedef {object} NormalizedRenderScope
 * @property {"scope"} type
 * @property {import("./index.d.ts").DrawRect} bounds
 * @property {number} opacity
 * @property {string | undefined} label
 * @property {boolean} coverageOnly
 * @property {NormalizedSemanticItem[]} items
 */

/** @typedef {NormalizedDraw | NormalizedRenderScope} NormalizedSemanticItem */

/**
 * @typedef {object} RenderTarget
 * @property {GPUTextureView | undefined} view
 * @property {number} width
 * @property {number} height
 * @property {number} logicalX
 * @property {number} logicalY
 * @property {string} label
 */

/**
 * @typedef {RenderTarget & {texture: import("./renderGroups.js").TransientTexture}} RenderedGroup
 */

/** @param {unknown} value @returns {value is import("./index.d.ts").RenderScope} */
function isRenderScope(value) {
    return typeof value === "object" && value !== null && "items" in value;
}

/**
 * @param {NormalizedSemanticItem} item
 * @returns {boolean}
 */
function requiresMultisampling(item) {
    return item.type === "scope"
        ? item.coverageOnly
        : item.requiredSampleCount === 4;
}

/**
 * @param {import("./index.d.ts").DrawRect} a
 * @param {import("./index.d.ts").DrawRect} b
 */
function expandRect(a, b) {
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    a.x = Math.min(a.x, b.x);
    a.y = Math.min(a.y, b.y);
    a.width = right - a.x;
    a.height = bottom - a.y;
}

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
 * @param {boolean} [allowEmpty]
 */
function assertRect(name, rect, allowEmpty = false) {
    if (
        !Number.isFinite(rect.x) ||
        !Number.isFinite(rect.y) ||
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height) ||
        (allowEmpty ? rect.width < 0 : rect.width <= 0) ||
        (allowEmpty ? rect.height < 0 : rect.height <= 0)
    ) {
        throw new RendererError(
            `${name} must have finite coordinates and ${allowEmpty ? "non-negative" : "positive"} dimensions.`
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
