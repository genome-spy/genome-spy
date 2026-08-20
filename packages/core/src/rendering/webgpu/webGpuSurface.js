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

    /** @type {Set<import("@genome-spy/webgpu-renderer").MarkId>} */
    #markIds = new Set();

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
     * @param {import("@genome-spy/webgpu-renderer").MarkDefinition<any>} definition
     * @param {object} config
     */
    createMark(definition, config) {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        const handle = this.#renderer.createMark(definition, config);
        this.#markIds.add(handle.markId);
        return handle;
    }

    destroyMarks() {
        if (!this.#renderer) {
            return;
        }
        for (const markId of this.#markIds) {
            this.#renderer.destroyMark(markId);
        }
        this.#markIds.clear();
    }

    render() {
        if (!this.#renderer) {
            throw new Error("The WebGPU surface has not been initialized.");
        }
        this.#renderer.render();
    }

    finalize() {
        this.destroyMarks();
        this.#sizeHelper.finalize();
        this.canvas.remove();
    }
}
