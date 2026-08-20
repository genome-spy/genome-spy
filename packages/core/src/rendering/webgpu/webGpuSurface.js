import { createRenderer } from "@genome-spy/webgpu-renderer";

import CanvasSizeHelper from "../canvasSizeHelper.js";

/**
 * Owns the live WebGPU canvas and the low-level renderer used by the PoC.
 */
export default class WebGpuSurface {
    /** @type {CanvasSizeHelper} */
    #sizeHelper;

    /** @type {import("@genome-spy/webgpu-renderer").Renderer | undefined} */
    #renderer;

    /** @type {Map<import("../../marks/mark.js").default, RetainedMark>} */
    #marks = new Map();

    /** @type {import("@genome-spy/webgpu-renderer").MarkId[]} */
    #frameMarkIds = [];

    /** @type {{logicalWidth: number, logicalHeight: number, physicalWidth: number, physicalHeight: number} | undefined} */
    #appliedSize;

    /**
     * @param {import("../renderingBackend.js").RenderingBackendOptions} options
     */
    constructor(options) {
        this.options = options;
        this.canvas = document.createElement("canvas");
        options.container.appendChild(this.canvas);

        this.#sizeHelper = new CanvasSizeHelper(
            options.container,
            this.canvas,
            options.sizeSource,
            () => {
                if (this.#adjustCanvas()) {
                    options.onCanvasResize();
                }
            }
        );
        this.#adjustCanvas();
    }

    async initialize() {
        this.#renderer = await createRenderer(this.canvas);
        this.#updateRendererGlobals();
    }

    invalidateSize() {
        this.#sizeHelper.invalidate();
        return this.#adjustCanvas();
    }

    #adjustCanvas() {
        const logicalSize = this.getLogicalCanvasSize();
        const physicalSize =
            this.#sizeHelper.getPhysicalCanvasSize(logicalSize);
        if (
            this.#appliedSize?.logicalWidth == logicalSize.width &&
            this.#appliedSize.logicalHeight == logicalSize.height &&
            this.#appliedSize.physicalWidth == physicalSize.width &&
            this.#appliedSize.physicalHeight == physicalSize.height
        ) {
            return false;
        }

        this.canvas.style.width = `${logicalSize.width}px`;
        this.canvas.style.height = `${logicalSize.height}px`;
        this.canvas.width = physicalSize.width;
        this.canvas.height = physicalSize.height;
        this.#appliedSize = {
            logicalWidth: logicalSize.width,
            logicalHeight: logicalSize.height,
            physicalWidth: physicalSize.width,
            physicalHeight: physicalSize.height,
        };
        this.#updateRendererGlobals();
        return true;
    }

    #updateRendererGlobals() {
        if (!this.#renderer || !this.#appliedSize) {
            return;
        }
        this.#renderer.updateGlobals({
            width: this.#appliedSize.logicalWidth,
            height: this.#appliedSize.logicalHeight,
            dpr: this.getDevicePixelRatio(),
        });
    }

    getLogicalCanvasSize() {
        return this.#sizeHelper.getLogicalCanvasSize();
    }

    getDevicePixelRatio() {
        return this.#sizeHelper.getDevicePixelRatio();
    }

    /**
     * Starts a new ordered frame without releasing retained marks.
     */
    beginFrame() {
        this.#frameMarkIds.length = 0;
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("@genome-spy/webgpu-renderer").MarkDefinition<any>} definition
     * @param {object} config
     */
    useMark(mark, definition, config) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }

        let retained = this.#marks.get(mark);
        if (!retained || retained.definition !== definition) {
            if (retained) {
                this.#renderer.destroyMark(retained.handle.markId);
            }
            const handle = this.#renderer.createMark(
                definition,
                makeRetainableConfig(config)
            );
            retained = { definition, handle };
            this.#marks.set(mark, retained);
        } else {
            updateRetainedMark(
                this.#renderer,
                retained.handle,
                retained.definition,
                config
            );
        }

        this.#frameMarkIds.push(retained.handle.markId);
    }

    destroyMarks() {
        if (!this.#renderer) {
            return;
        }
        for (const { handle } of this.#marks.values()) {
            this.#renderer.destroyMark(handle.markId);
        }
        this.#marks.clear();
        this.#frameMarkIds.length = 0;
    }

    render() {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        this.#renderer.render(this.#frameMarkIds);
    }

    finalize() {
        this.destroyMarks();
        this.#sizeHelper.finalize();
        this.canvas.remove();
    }
}

/**
 * Makes numeric value channels updateable without changing their pipeline
 * shape. Text values remain renderer-owned because they require glyph layout.
 *
 * @param {any} config
 */
function makeRetainableConfig(config) {
    return {
        ...config,
        channels: Object.fromEntries(
            Object.entries(config.channels).map(([name, channel]) => [
                name,
                channel.value !== undefined && typeof channel.value != "string"
                    ? { ...channel, dynamic: true }
                    : channel,
            ])
        ),
    };
}

/**
 * Updates the resource slots exposed by the renderer's public mark handle.
 * The PoC grammar keeps channel structure stable after initialization.
 *
 * @param {import("@genome-spy/webgpu-renderer").Renderer} renderer
 * @param {import("@genome-spy/webgpu-renderer").MarkHandle} handle
 * @param {import("@genome-spy/webgpu-renderer").MarkDefinition<any>} definition
 * @param {any} config
 */
function updateRetainedMark(renderer, handle, definition, config) {
    /** @type {Record<string, import("@genome-spy/webgpu-renderer").TypedArray>} */
    const series = {};

    for (const [name, channel] of Object.entries(config.channels)) {
        if (ArrayBuffer.isView(channel.data)) {
            series[name] = channel.data;
        }

        const scaleSlot = handle.scales[name]?.default;
        if (scaleSlot && channel.scale) {
            if (channel.scale.domain) {
                scaleSlot.setDomain(channel.scale.domain);
            }
            if (channel.scale.range) {
                scaleSlot.setRange(channel.scale.range);
            }
        }

        const valueSlot = handle.values[name]?.default;
        if (valueSlot && channel.value !== undefined) {
            valueSlot.set(channel.value);
        }
    }

    // Text layout expands series to glyph instances. Updating the source
    // strings needs a dedicated public renderer slot that the PoC lacks.
    if (definition.type != "text") {
        renderer.updateSeries(handle.markId, series, config.count);
    }
}

/**
 * @typedef {object} RetainedMark
 * @prop {import("@genome-spy/webgpu-renderer").MarkDefinition<any>} definition
 * @prop {import("@genome-spy/webgpu-renderer").MarkHandle} handle
 */
