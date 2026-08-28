import CanvasSizeHelper from "../canvasSizeHelper.js";
import { colorizePickingIds } from "./picking/pickingColorizer.js";
import SoftwarePickingBuffer from "./picking/softwarePickingBuffer.js";

export default class Canvas2DSurface {
    /** @type {CanvasSizeHelper} */
    #sizeHelper;

    /** @type {{logicalWidth: number, logicalHeight: number, physicalWidth: number, physicalHeight: number} | undefined} */
    #appliedSize;

    /** @type {SoftwarePickingBuffer | undefined} */
    #pickingBuffer;

    #pickingBufferVisualizationEnabled = false;

    /** @type {HTMLCanvasElement | undefined} */
    #diagnosticCanvas;

    /** @type {CanvasRenderingContext2D | undefined} */
    #diagnosticContext;

    /** @type {ImageData | undefined} */
    #diagnosticImageData;

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

    /** @param {boolean} enabled @returns {boolean} */
    setPickingBufferVisualization(enabled) {
        if (this.#finalized) {
            return false;
        }
        this.#pickingBufferVisualizationEnabled = enabled;
        return true;
    }

    isPickingBufferVisualizationEnabled() {
        return this.#pickingBufferVisualizationEnabled;
    }

    blitPickingBufferVisualization() {
        if (!this.#pickingBufferVisualizationEnabled || this.#finalized) {
            return;
        }
        const buffer = this.getPickingBuffer();
        const context = this.context;
        context.resetTransform();
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        if (buffer.width == 0 || buffer.height == 0) {
            return;
        }

        const diagnosticContext = this.#getDiagnosticContext();
        if (
            this.#diagnosticCanvas.width != buffer.width ||
            this.#diagnosticCanvas.height != buffer.height
        ) {
            this.#diagnosticCanvas.width = buffer.width;
            this.#diagnosticCanvas.height = buffer.height;
            this.#diagnosticImageData = diagnosticContext.createImageData(
                buffer.width,
                buffer.height
            );
        }
        const imageData = /** @type {ImageData} */ (this.#diagnosticImageData);
        colorizePickingIds(buffer.ids, imageData.data);
        diagnosticContext.putImageData(imageData, 0, 0);

        const logicalSize = this.getLogicalCanvasSize();
        const destinationWidth =
            (buffer.width * this.canvas.width) / logicalSize.width;
        const destinationHeight =
            (buffer.height * this.canvas.height) / logicalSize.height;
        const smoothing = context.imageSmoothingEnabled;
        context.imageSmoothingEnabled = false;
        context.drawImage(
            this.#diagnosticCanvas,
            0,
            0,
            buffer.width,
            buffer.height,
            0,
            0,
            destinationWidth,
            destinationHeight
        );
        context.imageSmoothingEnabled = smoothing;
    }

    /** @returns {CanvasRenderingContext2D} */
    #getDiagnosticContext() {
        if (!this.#diagnosticContext) {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error(
                    "Unable to initialize a Canvas2D picking diagnostic context."
                );
            }
            this.#diagnosticCanvas = canvas;
            this.#diagnosticContext = context;
        }
        return this.#diagnosticContext;
    }

    finalize() {
        if (this.#finalized) {
            return;
        }
        this.#finalized = true;
        this.#pickingBuffer?.dispose();
        this.#pickingBuffer = undefined;
        this.#pickingBufferVisualizationEnabled = false;
        if (this.#diagnosticCanvas) {
            this.#diagnosticCanvas.width = 0;
            this.#diagnosticCanvas.height = 0;
        }
        this.#diagnosticCanvas = undefined;
        this.#diagnosticContext = undefined;
        this.#diagnosticImageData = undefined;
        this.#sizeHelper.finalize();
        this.canvas.remove();
    }
}
