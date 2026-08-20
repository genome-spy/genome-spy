import { peek } from "../../utils/arrayUtils.js";
import ViewRenderingContext from "../../view/renderingContext/viewRenderingContext.js";
import {
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../../view/renderingContext/clipOptions.js";
import { RASTER_COORDINATE_OFFSET } from "../renderingConstants.js";
import { createWebGpuMarkConfig } from "./webGpuMarkAdapter.js";

/**
 * Translates one completed, non-faceted Core layout into retained WebGPU marks.
 */
export default class WebGpuViewRenderingContext extends ViewRenderingContext {
    /** @type {{view: import("../../view/view.js").default, coords: import("../../view/layout/rectangle.js").default}[]} */
    #viewStack = [];

    /** @type {Set<import("../../view/view.js").default>} */
    #views = new Set();

    /** @type {Set<import("../../marks/mark.js").default>} */
    #marks = new Set();

    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     * @param {{surface: import("./webGpuSurface.js").default}} options
     */
    constructor(globalOptions, options) {
        super(globalOptions);
        this.surface = options.surface;
    }

    getDevicePixelRatio() {
        return this.surface.getDevicePixelRatio();
    }

    /**
     * @param {import("../../view/view.js").default} view
     * @param {import("../../view/layout/rectangle.js").default} coords
     * @override
     */
    pushView(view, coords) {
        if (!this.#views.has(view)) {
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
            throw new Error("Unbalanced WebGPU view rendering context stack.");
        }
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        const viewOpacity = mark.unitView.getEffectiveOpacity();
        if (viewOpacity <= 0) {
            return;
        }
        if (this.#marks.has(mark)) {
            throw createViewError(
                mark,
                "The WebGPU proof of concept does not support repeated mark occurrences."
            );
        }
        this.#marks.add(mark);

        const coords = this.currentCoords;
        const markCoords = coords.translate(
            RASTER_COORDINATE_OFFSET,
            RASTER_COORDINATE_OFFSET
        );
        const translated = createWebGpuMarkConfig(
            mark,
            options,
            markCoords,
            viewOpacity
        );
        if (translated) {
            const clip = prepareMarkClipOptionsFromClip(
                normalizeClipOptions(options),
                mark.properties.clip,
                coords
            );
            this.surface.useMark(
                mark,
                translated.definition,
                translated.config,
                { scissor: clip && this.#createScissor(clip) }
            );
        }
    }

    /**
     * Expands unclipped dimensions to the full canvas. The renderer intersects
     * the resulting logical-pixel scissor with the canvas bounds.
     *
     * @param {import("../../types/rendering.js").ClipOptions} clip
     * @returns {import("@genome-spy/webgpu-renderer").DrawRect}
     */
    #createScissor(clip) {
        const canvas = this.surface.getLogicalCanvasSize();
        return {
            x: clip.clipX ? clip.rect.x : 0,
            y: clip.clipY ? clip.rect.y : 0,
            width: clip.clipX ? clip.rect.width : canvas.width,
            height: clip.clipY ? clip.rect.height : canvas.height,
        };
    }

    get currentCoords() {
        const entry = peek(this.#viewStack);
        if (!entry) {
            throw new Error("No current view in WebGPU rendering context.");
        }
        return entry.coords;
    }
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} message
 */
function createViewError(mark, message) {
    const error = new Error(
        `${message} Mark: ${mark.getType()}. View: ${mark.unitView.getPathString()}`
    );
    /** @type {any} */ (error).view = mark.unitView;
    return error;
}
