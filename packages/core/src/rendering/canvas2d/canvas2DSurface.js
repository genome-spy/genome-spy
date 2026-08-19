import CanvasSizeHelper from "../canvasSizeHelper.js";

export default class Canvas2DSurface {
    /** @type {CanvasSizeHelper} */
    #sizeHelper;

    /** @type {{logicalWidth: number, logicalHeight: number, physicalWidth: number, physicalHeight: number} | undefined} */
    #appliedSize;

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
        return true;
    }

    getLogicalCanvasSize() {
        return this.#sizeHelper.getLogicalCanvasSize();
    }

    getDevicePixelRatio() {
        return this.#sizeHelper.getDevicePixelRatio();
    }

    finalize() {
        this.#sizeHelper.finalize();
        this.canvas.remove();
    }
}
