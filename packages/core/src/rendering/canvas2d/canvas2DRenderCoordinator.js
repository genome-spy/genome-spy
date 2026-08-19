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
    }

    computeLayout() {
        this.broadcast("layout");
        this.surface.invalidateSize();
        let remainingPasses = 5;
        while (true) {
            this.#render(false);
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
        this.#render(true);
    }

    /** @param {boolean} paint */
    #render(paint) {
        const size = this.surface.getLogicalCanvasSize();
        if (isNaN(size.width) || isNaN(size.height)) {
            return;
        }

        renderCanvas2D({
            viewRoot: this.viewRoot,
            context: this.context,
            width: size.width,
            height: size.height,
            devicePixelRatio: this.surface.getDevicePixelRatio(),
            background: this.getBackground(),
            paint,
        });
    }
}
