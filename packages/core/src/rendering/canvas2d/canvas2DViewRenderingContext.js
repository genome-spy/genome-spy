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

const MAX_RETAINED_OPACITY_LAYERS = 8;
const MAX_RETAINED_OPACITY_LAYER_PIXELS = 16_777_216;

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

    /** @type {CanvasRenderingContext2D[]} */
    #opacityLayers;

    /** @type {{context: CanvasRenderingContext2D, bounds: CanvasPhysicalBounds}[]} */
    #opacityTargetStack = [];

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
     *     xIndexManager?: import("./canvasXIndexManager.js").default,
     *     opacityLayers?: CanvasRenderingContext2D[]
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
        this.#opacityLayers = options.opacityLayers ?? [];
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
        if (this.paint && opacity > 0 && opacity !== 1) {
            const clip = getViewClipDirections(view);
            const bounds = normalizeOffscreenBounds(
                coords,
                this.devicePixelRatio,
                this.#targetBounds,
                clip
            );
            const context = acquireOpacityLayer(
                this.#opacityLayers,
                this.#opacityTargetStack.length,
                bounds.width,
                bounds.height
            );
            context.setTransform(
                this.devicePixelRatio,
                0,
                0,
                this.devicePixelRatio,
                -bounds.x,
                -bounds.y
            );
            this.#opacityTargetStack.push({
                context: this.context,
                bounds: this.#targetBounds,
            });
            this.context = context;
            this.#targetBounds = bounds;
        }
        this.#viewStack.push({ view, coords, opacity });
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
        if (this.paint && entry.opacity > 0 && entry.opacity !== 1) {
            const parent = this.#opacityTargetStack.pop();
            if (!parent) {
                throw new Error("Missing Canvas2D opacity parent target.");
            }
            const source = this.context.canvas;
            const sourceBounds = this.#targetBounds;
            this.context = parent.context;
            this.#targetBounds = parent.bounds;
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
        // Also track properties read directly by painters, such as shadows.
        mark.initializeRenderingRevisions(Object.keys(mark.properties));

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
                        devicePixelRatio: this.devicePixelRatio,
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

/**
 * Reuses one canvas per active opacity nesting depth. Oversized or excessively
 * deep layers remain invocation-local and are released to garbage collection.
 *
 * @param {CanvasRenderingContext2D[]} layers
 * @param {number} index
 * @param {number} width
 * @param {number} height
 */
function acquireOpacityLayer(layers, index, width, height) {
    const pixelCount = width * height;
    let context = layers[index];
    const retainedWithoutLayer = layers.reduce(
        (sum, retained, retainedIndex) =>
            retainedIndex === index
                ? sum
                : sum + retained.canvas.width * retained.canvas.height,
        0
    );
    const retain =
        index < MAX_RETAINED_OPACITY_LAYERS &&
        retainedWithoutLayer + pixelCount <= MAX_RETAINED_OPACITY_LAYER_PIXELS;

    if (!context || !retain) {
        const canvas = document.createElement("canvas");
        context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Unable to create a Canvas2D view group.");
        }
        if (retain) {
            layers[index] = context;
        }
    }

    if (context.canvas.width != width || context.canvas.height != height) {
        context.canvas.width = width;
        context.canvas.height = height;
    } else {
        context.resetTransform();
        context.clearRect(0, 0, width, height);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    return context;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
