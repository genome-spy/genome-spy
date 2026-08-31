import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import {
    getPerformanceProfiler,
    measurePerformance,
} from "../../debug/performanceProfiler.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";
import { toGpuColor } from "./webGpuColor.js";

/**
 * Publishes settled Core layouts and consumes them with retained WebGPU marks.
 */
export default class WebGpuRenderCoordinator {
    #dirtyPickingBuffer = true;

    /** @type {WebGpuViewRenderingContext | undefined} */
    #framePlan;

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
            const layoutResult = this.#createLayoutResult();
            if (!layoutResult) {
                return;
            }

            if (!this.surface.invalidateSize()) {
                this.#framePlan = this.#compileFramePlan(layoutResult);
                this.#dirtyPickingBuffer = true;
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
        const framePlan = this.#framePlan;
        if (!framePlan) {
            return;
        }

        const profiler = getPerformanceProfiler();
        profiler?.beginFrame("webgpu");
        const items = measurePerformance("markTranslation", () =>
            framePlan.render()
        );
        measurePerformance("surfaceRender", () =>
            this.surface.render(items, toGpuColor(this.getBackground()))
        );
        this.#dirtyPickingBuffer = true;
        profiler?.endFrame();
    }

    renderPickingFramebuffer() {
        const framePlan = this.#framePlan;
        if (!framePlan || !this.#dirtyPickingBuffer) {
            return;
        }
        const profiler = getPerformanceProfiler();
        profiler?.beginFrame("webgpu", "picking");
        const draws = measurePerformance("markTranslation", () =>
            framePlan.renderPicking()
        );
        measurePerformance("surfaceRender", () =>
            this.surface.renderPicking(draws)
        );
        this.#dirtyPickingBuffer = false;
        profiler?.endFrame();
    }

    /** @returns {import("../../view/layout/layoutResult.js").default | undefined} */
    #createLayoutResult() {
        const size = this.surface.getLogicalCanvasSize();
        if (isNaN(size.width) || isNaN(size.height)) {
            return undefined;
        }

        return measurePerformance("layout", () =>
            createLayoutResult(
                this.viewRoot,
                Rectangle.create(0, 0, size.width, size.height),
                {
                    devicePixelRatio: this.surface.getDevicePixelRatio(),
                    renderingOptions: { firstFacet: true },
                }
            )
        );
    }

    /**
     * @param {import("../../view/layout/layoutResult.js").default} layoutResult
     */
    #compileFramePlan(layoutResult) {
        const framePlan = new WebGpuViewRenderingContext({
            surface: this.surface,
        });
        measurePerformance("framePlanCompilation", () => {
            layoutResult.collectRenderCommands(framePlan);
            framePlan.finish();
        });
        return framePlan;
    }
}
