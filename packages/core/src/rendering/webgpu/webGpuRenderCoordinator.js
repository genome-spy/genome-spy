import { color as parseColor } from "d3-color";
import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import {
    getPerformanceProfiler,
    measurePerformance,
} from "../../debug/performanceProfiler.js";
import WebGpuViewRenderingContext from "./webGpuViewRenderingContext.js";

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
        const frame = measurePerformance("markTranslation", () =>
            framePlan.render({ picking: false })
        );
        measurePerformance("surfaceRender", () =>
            this.surface.render(frame.items, toGpuColor(this.getBackground()))
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
        const frame = measurePerformance("markTranslation", () =>
            framePlan.render({ picking: true })
        );
        measurePerformance("surfaceRender", () =>
            this.surface.renderPicking(frame.pickingDraws)
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
        const size = this.surface.getLogicalCanvasSize();
        const framePlan = new WebGpuViewRenderingContext({
            surface: this.surface,
            target: {
                width: size.width,
                height: size.height,
                dpr: this.surface.getDevicePixelRatio(),
            },
        });
        measurePerformance("framePlanCompilation", () => {
            layoutResult.collectRenderCommands(framePlan);
            framePlan.finish();
        });
        return framePlan;
    }
}

/**
 * @param {string | undefined} background
 * @returns {GPUColor | undefined}
 */
function toGpuColor(background) {
    if (background == null) {
        return { r: 0, g: 0, b: 0, a: 0 };
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
