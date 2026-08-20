import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import renderCanvas2D from "./renderCanvas2D.js";

export default class Canvas2DRenderCoordinator {
    /**
     * @param {object} options
     * @param {import("../../view/view.js").default} options.viewRoot
     * @param {CanvasRenderingContext2D} options.context
     * @param {import("./canvas2DSurface.js").default} options.surface
     * @param {() => string} options.getBackground
     * @param {(type: import("../../genomeSpy.js").BroadcastEventType, payload?: any) => void} options.broadcast
     * @param {() => void} options.onLayoutComputed
     */
    constructor(options) {
        this.viewRoot = options.viewRoot;
        this.context = options.context;
        this.surface = options.surface;
        this.getBackground = options.getBackground;
        this.broadcast = options.broadcast;
        this.onLayoutComputed = options.onLayoutComputed;

        /** @type {import("../../view/layout/layoutResult.js").default | undefined} */
        this.layoutResult = undefined;
    }

    computeLayout() {
        this.broadcast("layout");
        this.surface.invalidateSize();
        let remainingPasses = 5;
        while (true) {
            const layoutResult = this.#createLayoutResult();
            if (!layoutResult) {
                return;
            }

            if (!this.surface.invalidateSize()) {
                this.layoutResult = layoutResult;
                this.onLayoutComputed();
                this.broadcast("layoutComputed");
                return;
            }

            remainingPasses--;
            if (remainingPasses == 0) {
                throw new Error(
                    "Layout did not settle: canvas size kept changing."
                );
            }
        }
    }

    renderAll() {
        const layoutResult = this.layoutResult;
        if (!layoutResult) {
            return;
        }
        const size = this.surface.getLogicalCanvasSize();
        if (isNaN(size.width) || isNaN(size.height)) {
            return;
        }

        renderCanvas2D({
            layoutResult,
            context: this.context,
            width: size.width,
            height: size.height,
            devicePixelRatio: this.surface.getDevicePixelRatio(),
            background: this.getBackground(),
            paint: true,
        });
    }

    /** @returns {import("../../view/layout/layoutResult.js").default | undefined} */
    #createLayoutResult() {
        const size = this.surface.getLogicalCanvasSize();
        if (isNaN(size.width) || isNaN(size.height)) {
            return undefined;
        }

        return createLayoutResult(
            this.viewRoot,
            Rectangle.create(0, 0, size.width, size.height),
            {
                devicePixelRatio: this.surface.getDevicePixelRatio(),
                renderingOptions: { firstFacet: true },
            }
        );
    }
}
