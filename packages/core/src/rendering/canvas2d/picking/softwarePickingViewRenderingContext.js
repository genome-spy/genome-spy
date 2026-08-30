import { peek } from "../../../utils/arrayUtils.js";
import {
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../../../view/renderingContext/clipOptions.js";
import ViewRenderingContext from "../../../view/renderingContext/viewRenderingContext.js";
import {
    createAnchorCullBounds,
    createVisibleBounds,
    hasVisibleArea,
} from "../../immediate/bounds.js";
import {
    SampleFacetCoordsResolver,
    visitMarkOccurrences,
} from "../../immediate/markData.js";
import { warnOnce } from "../../../utils/warning.js";
import {
    isSoftwarePickingMarkSupported,
    renderMarkSoftwarePicking,
} from "./renderers/index.js";
import { getPerformanceProfiler } from "../../../debug/performanceProfiler.js";
import { isSampleFacetVisible } from "../../sampleFacet.js";

export default class SoftwarePickingViewRenderingContext extends ViewRenderingContext {
    /** @type {{view: import("../../../view/view.js").default, coords: import("../../../view/layout/rectangle.js").default}[]} */
    #viewStack = [];

    /** @type {Set<import("../../../view/view.js").default>} */
    #views = new Set();

    /** @type {import("../../../debug/performanceProfiler.js").PerformanceProfiler | undefined} */
    #profiler;

    #sampleFacetCoords = new SampleFacetCoordsResolver();

    /**
     * @param {{
     *     width: number,
     *     height: number,
     *     devicePixelRatio: number,
     *     getRasterizer: () => import("./softwarePickingRasterizer.js").default
     * }} options
     */
    constructor(options) {
        super({ picking: true });
        this.width = options.width;
        this.height = options.height;
        this.devicePixelRatio = options.devicePixelRatio;
        this.getRasterizer = options.getRasterizer;
        this.#profiler = getPerformanceProfiler();
    }

    getDevicePixelRatio() {
        return this.devicePixelRatio;
    }

    /**
     * @param {import("../../../view/view.js").default} view
     * @param {import("../../../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        if (!this.#views.has(view)) {
            view.onBeforeRender();
            this.#views.add(view);
        }
        this.#viewStack.push({ view, coords });
    }

    /** @param {import("../../../view/view.js").default} view @override */
    popView(view) {
        const entry = this.#viewStack.pop();
        if (entry?.view !== view) {
            throw new Error(
                "Unbalanced software picking view rendering context stack."
            );
        }
    }

    /**
     * @param {import("../../../marks/mark.js").default} mark
     * @param {import("../../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (
            !mark.isPickingParticipant() ||
            !isSoftwarePickingMarkSupported(mark)
        ) {
            return;
        }

        const sampleFacet = options.sampleFacetRenderingOptions;
        if (sampleFacet && !mark.encoders.facetIndex) {
            this.#profiler?.addCount("canvasSampleFacetOccurrences");
            if (!isSampleFacetVisible(options)) {
                this.#profiler?.addCount("canvasCulledSampleFacetOccurrences");
                return;
            }
        }

        const viewOpacity = mark.unitView.getEffectiveOpacity();
        if (viewOpacity <= 0) {
            return;
        }

        const coords = this.currentCoords;
        const inheritedClip = normalizeClipOptions(options);
        const markClip = prepareMarkClipOptionsFromClip(
            inheritedClip,
            mark.properties.clip,
            coords
        );
        const visibleBounds = createVisibleBounds(
            this.width,
            this.height,
            markClip
        );
        if (!hasVisibleArea(visibleBounds)) {
            return;
        }
        const anchorCullBounds = createAnchorCullBounds(
            coords,
            inheritedClip,
            mark.properties.cullByVisibleRange
        );
        visitMarkOccurrences(
            mark,
            options,
            coords,
            this.#sampleFacetCoords,
            (occurrenceCoords, data) => {
                if (data.length == 0) {
                    return;
                }
                const rasterizer = this.getRasterizer();
                rasterizer.setClip(
                    visibleBounds.x1,
                    visibleBounds.y1,
                    visibleBounds.x2,
                    visibleBounds.y2
                );
                renderMarkSoftwarePicking(mark, {
                    rasterizer,
                    coords: occurrenceCoords,
                    data,
                    visibleBounds,
                    anchorCullBounds,
                    viewOpacity,
                });
            },
            (facetIndex) =>
                warnOnce(
                    `Canvas2D picking could not resolve sample facet index ${facetIndex}. View: ${mark.unitView.getPathString()}`
                )
        );
    }

    get currentCoords() {
        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error(
                "No current view in software picking rendering context."
            );
        }
        return entry.coords;
    }
}
