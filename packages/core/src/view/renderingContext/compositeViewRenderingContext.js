import ViewRenderingContext from "./viewRenderingContext.js";

/**
 * @typedef {import("../view.js").default} View
 */
export default class CompositeViewRenderingContext extends ViewRenderingContext {
    /**
     *
     * @param  {...ViewRenderingContext} contexts
     */
    constructor(...contexts) {
        super({});

        this.contexts = contexts;
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {View} view
     * @param {import("../layout/rectangle.js").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        for (const context of this.contexts) {
            context.pushView(view, coords);
        }
    }

    /**
     * Must be called when a view's render() method is being exited
     *
     * @param {View} view
     */
    popView(view) {
        for (const context of this.contexts) {
            context.popView(view);
        }
    }

    /**
     *
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     */
    renderMark(mark, options) {
        for (const context of this.contexts) {
            context.renderMark(mark, options);
        }
    }
}
