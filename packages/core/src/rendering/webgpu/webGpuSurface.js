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

    /** @type {import("@genome-spy/webgpu-renderer").DrawCommand[]} */
    #frameDraws = [];

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
        this.#renderer = await createRenderer(this.canvas, {
            onInvalidate: () => {
                if (this.#renderer) {
                    this.options.onRenderInvalidated?.();
                }
            },
        });
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
        this.#frameDraws.length = 0;
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} definition
     * @param {any} config
     * @param {{scissor?: import("@genome-spy/webgpu-renderer").DrawRect, visibleRange?: import("@genome-spy/webgpu-renderer").DrawVisibleRange}} [options]
     */
    useMark(mark, definition, config, options = {}) {
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
            retained = {
                definition,
                handle,
                series: collectSeries(config),
                count: config.count,
            };
            this.#marks.set(mark, retained);
        } else {
            updateRetainedMark(retained, config);
        }

        // Core still bakes absolute canvas coordinates into scale ranges, so
        // occurrence viewports remain intentionally omitted here.
        this.#frameDraws.push({
            mark: retained.handle,
            ...(options.scissor ? { scissor: options.scissor } : {}),
            ...(options.visibleRange
                ? { visibleRange: options.visibleRange }
                : {}),
        });
    }

    /**
     * @param {GPUColor} [clearColor]
     */
    render(clearColor) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        this.#renderer.render({
            draws: this.#frameDraws,
            ...(clearColor ? { clearColor } : {}),
        });
    }

    finalize() {
        this.#renderer?.destroy();
        this.#renderer = undefined;
        this.#marks.clear();
        this.#frameDraws.length = 0;
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
 * @param {RetainedMark} retained
 * @param {any} config
 */
function updateRetainedMark(retained, config) {
    for (const [name, channel] of Object.entries(config.channels)) {
        const scaleSlot = retained.handle.scales[name]?.default;
        if (scaleSlot && channel.scale) {
            if (channel.scale.domain) {
                scaleSlot.setDomain(channel.scale.domain);
            }
            if (channel.scale.range) {
                scaleSlot.setRange(channel.scale.range);
            }
        }

        const valueSlot = retained.handle.values[name]?.default;
        if (valueSlot && channel.value !== undefined) {
            valueSlot.set(channel.value);
        }
    }

    if (hasSeriesChanges(retained, config)) {
        retained.series = collectSeries(config);
        retained.count = config.count;
        retained.handle.series.replace(retained.series, retained.count);
    }
}

/**
 * @param {RetainedMark} retained
 * @param {any} config
 */
function hasSeriesChanges(retained, config) {
    if (retained.count != config.count) {
        return true;
    }

    for (const [name, channel] of Object.entries(config.channels)) {
        const series = getChannelSeries(channel);
        if (series !== undefined && retained.series[name] !== series) {
            return true;
        }
    }
    return false;
}

/**
 * @param {any} config
 * @returns {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>}
 */
function collectSeries(config) {
    /** @type {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>} */
    const series = {};
    for (const [name, channel] of Object.entries(config.channels)) {
        const channelSeries = getChannelSeries(channel);
        if (channelSeries !== undefined) {
            series[name] = channelSeries;
        }
    }
    return series;
}

/** @param {any} channel */
function getChannelSeries(channel) {
    if (ArrayBuffer.isView(channel.data) || Array.isArray(channel.data)) {
        return channel.data;
    } else if (typeof channel.value == "string") {
        return channel.value;
    } else {
        return undefined;
    }
}

/**
 * @typedef {object} RetainedMark
 * @prop {import("@genome-spy/webgpu-renderer").MarkDefinition<any, any>} definition
 * @prop {import("@genome-spy/webgpu-renderer").MarkHandle} handle
 * @prop {Record<string, import("@genome-spy/webgpu-renderer").SeriesData>} series
 * @prop {number} count
 */
