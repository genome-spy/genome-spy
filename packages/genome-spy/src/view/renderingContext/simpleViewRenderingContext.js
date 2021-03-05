import ViewRenderingContext from "./viewRenderingContext";

/**
 * This class is mainly for illustrative purpose, i.e., how the rendering
 * would be performed in the most straightforward, unoptimized way.
 *
 * @typedef {import("../view").default} View
 */
export default class SimpleViewRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../rendering").GlobalRenderingOptions} globalOptions
     */
    constructor(globalOptions) {
        super(globalOptions);
        /** @type {import("../../utils/layout/rectangle").default} */
        this.coords = undefined;

        /** @type {Set<import("../view").default>} */
        this.views = new Set();
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
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
     * @param {import("../../marks/mark").default} mark
     * @param {import("../view").RenderingOptions} options
     */
    renderMark(mark, options) {
        mark.prepareRender(this.globalOptions);
        mark.setViewport(this.coords, options.clipRect);
        mark.render(options)();
    }
}
