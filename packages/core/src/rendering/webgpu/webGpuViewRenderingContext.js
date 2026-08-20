import { peek } from "../../utils/arrayUtils.js";
import ViewRenderingContext from "../../view/renderingContext/viewRenderingContext.js";
import { createWebGpuMarkConfig } from "./webGpuMarkAdapter.js";

/**
 * Translates one ordinary, non-faceted Core traversal into low-level WebGPU
 * marks. Rebuilding marks per frame is an intentional Milestone 1 shortcut.
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
     * @param {{surface: import("./webGpuSurface.js").default, paint: boolean}} options
     */
    constructor(globalOptions, options) {
        super(globalOptions);
        this.surface = options.surface;
        this.paint = options.paint;
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
            throw new Error("Unbalanced WebGPU view rendering context stack.");
        }
    }

    /**
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (!this.paint || mark.unitView.getEffectiveOpacity() <= 0) {
            return;
        }
        if (mark.unitView.getEffectiveOpacity() != 1) {
            throw createViewError(
                mark,
                "The WebGPU proof of concept does not support view opacity."
            );
        }
        if (this.#marks.has(mark)) {
            throw createViewError(
                mark,
                "The WebGPU proof of concept does not support repeated mark occurrences."
            );
        }
        this.#marks.add(mark);

        const translated = createWebGpuMarkConfig(
            mark,
            options,
            this.currentCoords
        );
        if (translated) {
            this.surface.createMark(translated.definition, translated.config);
        }
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
