import { group } from "d3-array";

import ViewRenderingContext from "./viewRenderingContext";

/**
 *
 * @typedef {object} DeferredRenderingRequest Allows for collecting marks for
 *      optimized rendering order.
 * @prop {import("../../marks/mark").default} mark
 * @prop {import("../../utils/layout/rectangle").default} coords
 * @prop {import("../view").RenderingOptions} options
 */
export default class DeferredViewRenderingContext extends ViewRenderingContext {
    constructor() {
        super();

        /**
         * @type {DeferredRenderingRequest[]}
         */
        this.buffer = [];

        /** @type {import("../../utils/layout/rectangle").default} */
        this.coords = undefined;
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {import("../view").default} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        this.coords = coords;
    }

    /**
     *
     * @param {import("../../marks/mark").default} mark
     * @param {import("../view").RenderingOptions} options
     */
    renderMark(mark, options) {
        this.buffer.push({
            mark,
            coords: this.coords,
            options
        });
    }

    /**
     * Renders marks in an optimized order, minimizing the number of WebGL state
     * changes.
     */
    renderDeferred() {
        if (!this.requestByMark) {
            // Store for subsequent renderings
            this.requestByMark = group(this.buffer, request => request.mark);
        }

        for (const mark of this.requestByMark.keys()) {
            // Change program, set common uniforms (mark properties, shared domains)
            mark.prepareRender();

            /** @type {import("../../utils/layout/rectangle").default} */
            let previousCoords;
            for (const request of this.requestByMark.get(mark)) {
                // Render each facet
                if (!request.coords.equals(previousCoords)) {
                    mark.setViewport(request.coords);
                }
                mark.render(request.options);
                previousCoords = request.coords;
            }
        }
    }
}
