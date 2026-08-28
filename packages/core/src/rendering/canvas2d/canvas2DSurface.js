import CanvasSizeHelper from "../canvasSizeHelper.js";
import SoftwarePickingBuffer from "./picking/softwarePickingBuffer.js";

export default class Canvas2DSurface {
    /** @type {CanvasSizeHelper} */
    #sizeHelper;

    /** @type {{logicalWidth: number, logicalHeight: number, physicalWidth: number, physicalHeight: number} | undefined} */
    #appliedSize;

    /** @type {SoftwarePickingBuffer | undefined} */
    #pickingBuffer;

    #finalized = false;

    /**
     * @param {import("../renderingBackend.js").RenderingBackendOptions} options
     */
    constructor(options) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error(
                "Unable to initialize a Canvas2D rendering context."
            );
        }

        this.canvas = canvas;
        this.context = context;

        options.container.appendChild(canvas);
        try {
            this.#sizeHelper = new CanvasSizeHelper(
                options.container,
                canvas,
                options.sizeSource,
                () => {
                    if (this.#adjustCanvas()) {
                        options.onCanvasResize();
                    }
                }
            );
            this.#adjustCanvas();
        } catch (error) {
            this.#sizeHelper?.finalize();
            canvas.remove();
            throw error;
        }
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
        this.#pickingBuffer?.resize(logicalSize.width, logicalSize.height);
        return true;
    }

    getLogicalCanvasSize() {
        return this.#sizeHelper.getLogicalCanvasSize();
    }

    getDevicePixelRatio() {
        return this.#sizeHelper.getDevicePixelRatio();
    }

    /**
     * Lazily creates the logical-pixel picking surface.
     *
     * @returns {SoftwarePickingBuffer}
     */
    getPickingBuffer() {
        if (this.#finalized) {
            throw new Error("Canvas2D surface has been finalized.");
        }
        const size = this.getLogicalCanvasSize();
        this.#pickingBuffer ??= new SoftwarePickingBuffer(
            size.width,
            size.height
        );
        return this.#pickingBuffer;
    }

    clearPickingBuffer() {
        this.#pickingBuffer?.clear();
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    readPickingId(x, y) {
        return this.#finalized ? 0 : (this.#pickingBuffer?.read(x, y) ?? 0);
    }

    /** @returns {HTMLCanvasElement | undefined} */
    createPickingBufferVisualization() {
        if (this.#finalized) {
            return undefined;
        }
        const buffer = this.getPickingBuffer();
        const canvas = document.createElement("canvas");
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error(
                "Unable to initialize a Canvas2D picking visualization context."
            );
        }
        if (buffer.width > 0 && buffer.height > 0) {
            const imageData = context.createImageData(
                buffer.width,
                buffer.height
            );
            for (let i = 0; i < buffer.ids.length; i++) {
                const id = buffer.ids[i];
                const offset = i * 4;
                if (id != 0) {
                    const color = Math.imul(id ^ (id >>> 16), 0x45d9f3b);
                    imageData.data[offset] = 64 + (color & 127);
                    imageData.data[offset + 1] = 64 + ((color >>> 8) & 127);
                    imageData.data[offset + 2] = 64 + ((color >>> 16) & 127);
                }
                imageData.data[offset + 3] = 255;
            }
            context.putImageData(imageData, 0, 0);
        }
        return canvas;
    }

    finalize() {
        if (this.#finalized) {
            return;
        }
        this.#finalized = true;
        this.#pickingBuffer?.dispose();
        this.#pickingBuffer = undefined;
        this.#sizeHelper.finalize();
        this.canvas.remove();
    }
}
