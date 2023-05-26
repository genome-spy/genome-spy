/**
 * @typedef {import("../view").default} View
 */
export default class ViewRenderingContext {
    /**
     *
     * @param {import("../../types/rendering").GlobalRenderingOptions} globalOptions
     */
    constructor(globalOptions) {
        this.globalOptions = globalOptions;
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
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
     * @param {import("../../marks/mark").default} mark
     * @param {import("../../types/rendering").RenderingOptions} options
     */
    renderMark(mark, options) {
        //
    }
}
