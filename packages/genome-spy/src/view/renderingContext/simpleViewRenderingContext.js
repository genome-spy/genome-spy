/**
 * @typedef {import("../view").default} View
 */
export default class SimpleViewRenderingContext {
    constructor() {
        /** @type {import("../../utils/layout/rectangle").default} */
        this.coords = undefined;
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
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
        mark.prepareRender();
        mark.setViewport(this.coords);
        mark.render(options);
    }
}
