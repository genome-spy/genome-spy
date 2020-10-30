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
        if (!this.pipeline) {
            /**
             * Store the operations as a linear pipeline for cheap subsequent rendering.
             *
             * @type {(function():void)[]}
             */
            this.pipeline = [];

            const requestByMark = group(this.buffer, request => request.mark);

            for (const [mark, requests] of requestByMark.entries()) {
                // Change program, set common uniforms (mark properties, shared domains)
                this.pipeline.push(() => mark.prepareRender());

                /** @type {import("../../utils/layout/rectangle").default} */
                let previousCoords;
                for (const request of requests) {
                    const coords = request.coords;
                    const options = request.options;
                    // Render each facet
                    if (!coords.equals(previousCoords)) {
                        this.pipeline.push(() => mark.setViewport(coords));
                    }
                    this.pipeline.push(() => mark.render(options));
                    previousCoords = request.coords;
                }
            }
        }

        // Execute the pipeline
        for (const op of this.pipeline) {
            op();
        }
    }
}
