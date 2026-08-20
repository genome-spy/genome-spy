import Rectangle from "../../view/layout/rectangle.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

/**
 * Runs Core layout traversals and rebuilds the narrow PoC mark set for each
 * painted frame.
 */
export default class WebGpuRenderCoordinator {
    /**
     * @param {object} options
     * @param {import("../../view/view.js").default} options.viewRoot
     * @param {import("./webGpuSurface.js").default} options.surface
     * @param {() => string | undefined} options.getBackground
     * @param {(type: import("../../genomeSpy.js").BroadcastEventType, payload?: any) => void} options.broadcast
     * @param {() => void} options.onLayoutComputed
     */
    constructor(options) {
        this.viewRoot = options.viewRoot;
        this.surface = options.surface;
        this.getBackground = options.getBackground;
        this.broadcast = options.broadcast;
        this.onLayoutComputed = options.onLayoutComputed;
    }

    computeLayout() {
        this.broadcast("layout");
        this.surface.invalidateSize();
        let remainingPasses = 5;
        while (true) {
            this.#traverse(false);
            if (!this.surface.invalidateSize()) {
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
        this.#assertSupportedBackground();
        this.surface.destroyMarks();
        this.#traverse(true);
        this.surface.render();
    }

    /** @param {boolean} paint */
    #traverse(paint) {
        const size = this.surface.getLogicalCanvasSize();
        if (isNaN(size.width) || isNaN(size.height)) {
            return;
        }

        const context = new WebGpuViewRenderingContext(
            { picking: false },
            {
                surface: this.surface,
                paint,
            }
        );
        this.viewRoot.render(
            context,
            Rectangle.create(0, 0, size.width, size.height),
            { firstFacet: true }
        );
    }

    #assertSupportedBackground() {
        const background = this.getBackground();
        if (
            background != null &&
            !["white", "#fff", "#ffffff"].includes(background.toLowerCase())
        ) {
            throw new Error(
                "The experimental WebGPU renderer currently supports only its default white canvas background."
            );
        }
    }
}
