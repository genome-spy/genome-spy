import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import {
    getPerformanceProfiler,
    measurePerformance,
} from "../../debug/performanceProfiler.js";
import renderCanvas2D from "./renderCanvas2D.js";
import SoftwarePickingRasterizer from "./picking/softwarePickingRasterizer.js";
import SoftwarePickingViewRenderingContext from "./picking/softwarePickingViewRenderingContext.js";

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

        /** @type {SoftwarePickingRasterizer | undefined} */
        this.pickingRasterizer = undefined;
        this.dirtyPickingBuffer = true;
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
                this.dirtyPickingBuffer = true;
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

        if (this.surface.isPickingBufferVisualizationEnabled()) {
            this.dirtyPickingBuffer = true;
            this.renderPickingFramebuffer();
            this.surface.blitPickingBufferVisualization();
        } else {
            renderCanvas2D({
                layoutResult,
                context: this.context,
                width: size.width,
                height: size.height,
                devicePixelRatio: this.surface.getDevicePixelRatio(),
                background: this.getBackground(),
                paint: true,
            });
            this.dirtyPickingBuffer = true;
        }
    }

    renderPickingFramebuffer() {
        const layoutResult = this.layoutResult;
        if (!this.dirtyPickingBuffer || !layoutResult) {
            return;
        }
        const size = this.surface.getLogicalCanvasSize();
        if (isNaN(size.width) || isNaN(size.height)) {
            return;
        }

        this.surface.clearPickingBuffer();
        let rasterizer = this.pickingRasterizer;
        let rasterizerPrepared = false;
        const renderingContext = new SoftwarePickingViewRenderingContext({
            width: size.width,
            height: size.height,
            devicePixelRatio: this.surface.getDevicePixelRatio(),
            getRasterizer: () => {
                if (!rasterizer) {
                    rasterizer = new SoftwarePickingRasterizer(
                        this.surface.getPickingBuffer()
                    );
                    this.pickingRasterizer = rasterizer;
                }
                if (!rasterizerPrepared) {
                    rasterizer.resetClip();
                    rasterizer.resetStatistics();
                    rasterizerPrepared = true;
                }
                return rasterizer;
            },
        });

        const profiler = getPerformanceProfiler();
        profiler?.beginFrame("canvas", "picking");
        try {
            measurePerformance("picking", () =>
                layoutResult.collectRenderCommands(renderingContext)
            );
            this.dirtyPickingBuffer = false;
            if (rasterizerPrepared) {
                reportPickingStatistics(
                    /** @type {SoftwarePickingRasterizer} */ (rasterizer),
                    profiler
                );
            }
        } finally {
            profiler?.endFrame();
        }
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
 * @param {SoftwarePickingRasterizer} rasterizer
 * @param {import("../../debug/performanceProfiler.js").PerformanceProfiler | undefined} profiler
 */
function reportPickingStatistics(rasterizer, profiler) {
    if (!profiler) {
        return;
    }
    const statistics = rasterizer.getStatistics();
    profiler.addCount("pickingRectangles", statistics.rectangles);
    profiler.addCount("pickingSquares", statistics.squares);
    profiler.addCount("pickingPolygons", statistics.polygons);
    profiler.addCount("pickingSegments", statistics.segments);
    profiler.addCount("pickingCubics", statistics.cubics);
    profiler.addCount("pickingSpans", statistics.spans);
}
