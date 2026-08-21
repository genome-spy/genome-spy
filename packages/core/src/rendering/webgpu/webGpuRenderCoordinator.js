import { color as parseColor } from "d3-color";
import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

/**
 * Publishes settled Core layouts and consumes them with retained WebGPU marks.
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

        this.surface.beginFrame();
        layoutResult.collectRenderCommands(
            new WebGpuViewRenderingContext(
                { picking: false },
                { surface: this.surface }
            )
        );
        this.surface.render(toGpuColor(this.getBackground()));
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

/**
 * @param {string | undefined} background
 * @returns {GPUColor | undefined}
 */
function toGpuColor(background) {
    if (background == null) {
        return undefined;
    }
    const parsed = parseColor(background);
    if (!parsed) {
        throw new Error(
            `Invalid WebGPU canvas background color: ${background}`
        );
    }
    const rgb = parsed.rgb();
    return {
        r: rgb.r / 255,
        g: rgb.g / 255,
        b: rgb.b / 255,
        a: rgb.opacity,
    };
}
