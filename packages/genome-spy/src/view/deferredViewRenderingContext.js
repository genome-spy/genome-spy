import { group } from "d3-array";

import ViewRenderingContext from "./viewRenderingContext";

/**
 *
 * @typedef {object} DeferredRenderingRequest Allows for collecting marks for
 *      optimized rendering order.
 * @prop {import("../marks/mark").default} mark
 * @prop {import("../utils/layout/rectangle").default} coords
 * @prop {import("./view").RenderingOptions} options
 */
export default class DeferredViewRenderingContext extends ViewRenderingContext {
    constructor() {
        super();

        /**
         * @type {DeferredRenderingRequest[]}
         */
        this.buffer = [];
    }

    /**
     *
     * @param {import("../marks/mark").default} mark
     * @param {import("./view").RenderingOptions} options
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
        const requestByMark = group(this.buffer, request => request.mark);

        for (const mark of requestByMark.keys()) {
            // Change program, set common uniforms (mark properties, shared domains)
            mark.prepareRender();

            /** @type {import("../utils/layout/rectangle").default} */
            let previousCoords;
            for (const request of requestByMark.get(mark)) {
                // Render each facet
                // TODO: Optimize perf: Object.assign is a bit slow for throwaway objects
                const patchedOptions = Object.assign(request.options, {
                    skipViewportSetup: request.coords.equals(previousCoords)
                });
                mark.render(request.coords, patchedOptions);
                previousCoords = request.coords;
            }
        }
    }
}
