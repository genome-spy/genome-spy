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
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../layout/rectangle.js").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        //
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
        //
    }

    getDevicePixelRatio() {
        return 1;
    }
}
