/**
 * @typedef {import("../view.js").default} View
 */
export default class ViewRenderingContext {
    /**
     *
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     */
    constructor(globalOptions) {
        this.globalOptions = globalOptions;
    }

    /**
     * Opens a scope containing repeated renders of the same view hierarchy for
     * SampleView facets. Rendering contexts may use the scope for batching.
     */
    beginSampleFacetBatch() {
        //
    }

    /** Closes a scope opened by beginSampleFacetBatch(). */
    endSampleFacetBatch() {
        //
    }

    /**
     * Must be called when a view layout placement is entered
     *
     * @param {View} view
     * @param {import("../layout/rectangle.js").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        //
    }

    /**
     * Must be called when a view layout placement is exited
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
        //
    }

    getDevicePixelRatio() {
        return 1;
    }
}
