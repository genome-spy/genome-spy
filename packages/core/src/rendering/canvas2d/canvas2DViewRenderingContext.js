import { peek } from "../../utils/arrayUtils.js";
import {
    SampleFacetCoordsResolver,
    visitMarkOccurrences,
} from "../immediate/markData.js";
import {
    getViewClipDirections,
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../../view/renderingContext/clipOptions.js";
import ViewRenderingContext from "../../view/renderingContext/viewRenderingContext.js";
import {
    createAnchorCullBounds,
    createVisibleBounds,
    hasVisibleArea,
} from "../immediate/bounds.js";
import { renderMarkCanvas } from "./renderers/index.js";
import { warnOnce } from "../../utils/warning.js";
import { getPerformanceProfiler } from "../../debug/performanceProfiler.js";
import { isSampleFacetVisible } from "../sampleFacet.js";

export default class Canvas2DViewRenderingContext extends ViewRenderingContext {
    /** @type {CanvasViewStackEntry[]} */
    #viewStack = [];

    /** @type {WeakSet<import("../../view/view.js").default>} */
    #preparedViews = new WeakSet();

    /** @type {WeakMap<import("../../view/view.js").default, number>} */
    #effectiveViewOpacities = new WeakMap();

    /** @type {(mark: import("../../marks/mark.js").default) => boolean} */
    #markPredicate;

    /** @type {import("../../debug/performanceProfiler.js").PerformanceProfiler | undefined} */
    #profiler;

    #sampleFacetCoords = new SampleFacetCoordsResolver();

    /** @type {import("./canvasXIndexManager.js").default | undefined} */
    #xIndexManager;

    /** @type {[number, number]} */
    #indexedRange = [0, 0];

    /** @type {CanvasPhysicalBounds} */
    #targetBounds;

    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     * @param {{
     *     context: CanvasRenderingContext2D,
     *     width: number,
     *     height: number,
     *     devicePixelRatio: number,
     *     background: string | null,
     *     paint: boolean,
     *     markPredicate?: (mark: import("../../marks/mark.js").default) => boolean,
     *     xIndexManager?: import("./canvasXIndexManager.js").default
     * }} options
     */
    constructor(globalOptions, options) {
        super(globalOptions);
        this.context = options.context;
        this.width = options.width;
        this.height = options.height;
        this.devicePixelRatio = options.devicePixelRatio;
        this.paint = options.paint;
        this.#markPredicate = options.markPredicate ?? (() => true);
        this.#profiler = getPerformanceProfiler();
        this.#xIndexManager = options.xIndexManager;
        this.#targetBounds = {
            x: 0,
            y: 0,
            width: this.context.canvas.width,
            height: this.context.canvas.height,
        };

        if (this.paint) {
            const context = this.context;
            context.resetTransform();
            context.clearRect(
                0,
                0,
                context.canvas.width,
                context.canvas.height
            );
            context.setTransform(
                this.devicePixelRatio,
                0,
                0,
                this.devicePixelRatio,
                0,
                0
            );
            context.globalAlpha = 1;
            context.globalCompositeOperation = "source-over";
            if (options.background != null) {
                context.fillStyle = options.background;
                context.fillRect(0, 0, this.width, this.height);
            }
        }
    }

    getDevicePixelRatio() {
        return this.devicePixelRatio;
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @param {import("../../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        if (this.paint && !this.#preparedViews.has(view)) {
            view.onBeforeRender();
            this.#preparedViews.add(view);
        }

        const opacity = view.getOpacity();
        let parentContext;
        let parentBounds;
        if (this.paint && opacity > 0 && opacity !== 1) {
            const clip = getViewClipDirections(view);
            const bounds = normalizeOffscreenBounds(
                coords,
                this.devicePixelRatio,
                this.#targetBounds,
                clip
            );
            const canvas = document.createElement("canvas");
            canvas.width = bounds.width;
            canvas.height = bounds.height;
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Unable to create a Canvas2D view group.");
            }
            context.setTransform(
                this.devicePixelRatio,
                0,
                0,
                this.devicePixelRatio,
                -bounds.x,
                -bounds.y
            );
            parentContext = this.context;
            parentBounds = this.#targetBounds;
            this.context = context;
            this.#targetBounds = bounds;
        }
        this.#viewStack.push({
            view,
            coords,
            opacity,
            parentContext,
            parentBounds,
        });
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @override
     */
    popView(view) {
        const entry = this.#viewStack.pop();
        if (entry?.view !== view) {
            throw new Error(
                "Unbalanced Canvas2D view rendering context stack."
            );
        }
        if (entry.parentContext) {
            const source = this.context.canvas;
            const sourceBounds = this.#targetBounds;
            this.context = entry.parentContext;
            this.#targetBounds = entry.parentBounds;
            this.context.save();
            try {
                this.context.globalAlpha = entry.opacity;
                if (sourceBounds.width && sourceBounds.height) {
                    this.context.drawImage(
                        source,
                        sourceBounds.x / this.devicePixelRatio,
                        sourceBounds.y / this.devicePixelRatio,
                        sourceBounds.width / this.devicePixelRatio,
                        sourceBounds.height / this.devicePixelRatio
                    );
                }
            } finally {
                this.context.restore();
            }
        }
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (!this.paint || !this.#markPredicate(mark)) {
            return;
        }

        let effectiveOpacity = this.#effectiveViewOpacities.get(mark.unitView);
        if (effectiveOpacity === undefined) {
            effectiveOpacity = mark.unitView.getEffectiveOpacity();
            this.#effectiveViewOpacities.set(mark.unitView, effectiveOpacity);
        }
        if (effectiveOpacity <= 0) {
            return;
        }

        // Immediate encoders read live parameter values during every paint.
        // Register their dependencies so conditional encodings schedule that
        // paint when a selection or expression changes.
        mark.initializeRenderingRevisions([]);

        const sampleFacet = options.sampleFacetRenderingOptions;
        if (sampleFacet && !mark.encoders.facetIndex) {
            this.#profiler?.addCount("canvasSampleFacetOccurrences");
            if (!isSampleFacetVisible(sampleFacet)) {
                this.#profiler?.addCount("canvasCulledSampleFacetOccurrences");
                return;
            }
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
        const useXIndex = this.#xIndexManager?.prepare(mark) ?? false;

        const context = this.context;
        context.save();
        if (markClip) {
            const rect = markClip.rect.flatten();
            const x = markClip.clipX ? rect.x : 0;
            const y = markClip.clipY ? rect.y : 0;
            const width = markClip.clipX ? rect.width : this.width;
            const height = markClip.clipY ? rect.height : this.height;
            context.beginPath();
            context.rect(x, y, width, height);
            context.clip();
        }

        try {
            visitMarkOccurrences(
                mark,
                options,
                coords,
                this.#sampleFacetCoords,
                (occurrenceCoords, data) => {
                    let start = 0;
                    let end = data.length;
                    if (
                        useXIndex &&
                        this.#xIndexManager.query(data, this.#indexedRange)
                    ) {
                        start = this.#indexedRange[0];
                        end = this.#indexedRange[1];
                    }
                    return renderMarkCanvas(mark, {
                        context,
                        coords: occurrenceCoords,
                        data,
                        start,
                        end,
                        visibleBounds,
                        anchorCullBounds,
                        viewOpacity: 1,
                        warn: (message) =>
                            warnOnce(
                                `${message} View: ${mark.unitView.getPathString()}`
                            ),
                    });
                },
                (facetIndex) =>
                    warnOnce(
                        `Canvas2D could not resolve sample facet index ${facetIndex}. View: ${mark.unitView.getPathString()}`
                    )
            );
        } finally {
            context.restore();
        }
    }

    get currentCoords() {
        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error("No current view in Canvas2D rendering context.");
        }
        return entry.coords;
    }
}

/**
 * @typedef {object} CanvasViewStackEntry
 * @property {import("../../view/view.js").default} view
 * @property {import("../../view/layout/rectangle.js").default} coords
 * @property {number} opacity
 * @property {CanvasRenderingContext2D | undefined} parentContext
 * @property {CanvasPhysicalBounds | undefined} parentBounds
 */

/**
 * @typedef {object} CanvasPhysicalBounds
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Rounds a logical view rectangle outwards and clips it to its parent target.
 *
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} devicePixelRatio
 * @param {CanvasPhysicalBounds} parent
 * @param {{clipX: boolean, clipY: boolean}} clip
 * @returns {CanvasPhysicalBounds}
 */
function normalizeOffscreenBounds(coords, devicePixelRatio, parent, clip) {
    const parentRight = parent.x + parent.width;
    const parentBottom = parent.y + parent.height;
    const x = clip.clipX
        ? clamp(Math.floor(coords.x * devicePixelRatio), parent.x, parentRight)
        : parent.x;
    const y = clip.clipY
        ? clamp(Math.floor(coords.y * devicePixelRatio), parent.y, parentBottom)
        : parent.y;
    const right = clip.clipX
        ? clamp(
              Math.ceil((coords.x + coords.width) * devicePixelRatio),
              x,
              parentRight
          )
        : parentRight;
    const bottom = clip.clipY
        ? clamp(
              Math.ceil((coords.y + coords.height) * devicePixelRatio),
              y,
              parentBottom
          )
        : parentBottom;
    return { x, y, width: right - x, height: bottom - y };
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
