import { peek } from "../../utils/arrayUtils.js";
import { visitMarkOccurrences } from "../immediate/markData.js";
import {
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

export default class Canvas2DViewRenderingContext extends ViewRenderingContext {
    /** @type {{view: import("../../view/view.js").default, coords: import("../../view/layout/rectangle.js").default}[]} */
    #viewStack = [];

    /** @type {Set<import("../../view/view.js").default>} */
    #views = new Set();

    /** @type {(mark: import("../../marks/mark.js").default) => boolean} */
    #markPredicate;

    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     * @param {{
     *     context: CanvasRenderingContext2D,
     *     width: number,
     *     height: number,
     *     devicePixelRatio: number,
     *     background: string | null,
     *     paint: boolean,
     *     markPredicate?: (mark: import("../../marks/mark.js").default) => boolean
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
        if (this.paint && !this.#views.has(view)) {
            view.onBeforeRender();
            this.#views.add(view);
        }
        this.#viewStack.push({ view, coords });
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
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (
            !this.paint ||
            !this.#markPredicate(mark) ||
            mark.unitView.getEffectiveOpacity() <= 0
        ) {
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
                (occurrenceCoords, data) =>
                    renderMarkCanvas(mark, {
                        context,
                        coords: occurrenceCoords,
                        data,
                        visibleBounds,
                        anchorCullBounds,
                        viewOpacity: mark.unitView.getEffectiveOpacity(),
                        warn: (message) =>
                            warnOnce(
                                `${message} View: ${mark.unitView.getPathString()}`
                            ),
                    }),
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
