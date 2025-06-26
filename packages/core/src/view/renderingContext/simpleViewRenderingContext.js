import ViewRenderingContext from "./viewRenderingContext.js";

/**
 * This class is mainly for illustrative purpose, i.e., how the rendering
 * would be performed in the most straightforward, unoptimized way.
 *
 * @typedef {import("../view.js").default} View
 */
export default class SimpleViewRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     */
    constructor(globalOptions) {
        super(globalOptions);
        /** @type {import("../layout/rectangle.js").default} */
        this.coords = undefined;

        /** @type {Set<import("../view.js").default>} */
        this.views = new Set();
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../layout/rectangle.js").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        if (!this.views.has(view)) {
            // Ensure that the method is called only once, even when rendering facets.
            view.onBeforeRender();
            this.views.add(view);
        }

        this.coords = coords;
    }

    /**
     * Must be called when a view's render() method is being exited
     *
     * @param {View} view
     */
    popView(view) {
        //
    }

    /**
     *
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     */
    renderMark(mark, options) {
        if (this.globalOptions.picking && !mark.isPickingParticipant()) {
            return;
        }

        for (const op of mark.prepareRender(this.globalOptions)) {
            op();
        }

        const canvasSize = { width: 100, height: 100 }; // Placeholder, should be replaced with actual canvas size
        const dpr = this.getDevicePixelRatio();

        mark.setViewport(canvasSize, dpr, this.coords, options.clipRect);
        mark.render(options)();
    }
}
