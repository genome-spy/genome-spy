import { group } from "d3-array";

import ViewRenderingContext from "./viewRenderingContext";

/**
 *
 * @typedef {object} DeferredRenderingRequest Allows for collecting marks for
 *      optimized rendering order.
 * @prop {import("../../marks/mark").default} mark
 * @prop {function():void} callback
 * @prop {import("../../utils/layout/rectangle").default} coords
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

        /** @type {(import("../view").default)[]} */
        this.views = [];
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {import("../view").default} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        this.views.push(view);
        this.coords = coords;
    }

    /**
     *
     * @param {import("../../marks/mark").default} mark
     * @param {import("../view").RenderingOptions} options
     */
    renderMark(mark, options) {
        const callback = mark.render(options);
        if (callback) {
            this.buffer.push({
                mark,
                callback,
                coords: this.coords
            });
        }
    }

    /**
     * Renders marks in an optimized order, minimizing the number of WebGL state
     * changes.
     */
    renderDeferred() {
        if (!this.batch) {
            this._buildBatch();
        }

        for (const view of this.views) {
            view.onBeforeRender();
        }

        // Execute the batch
        for (const op of this.batch) {
            op();
        }
    }

    _buildBatch() {
        /**
         * Store the operations as a sequence of commands for cheap subsequent rendering.
         *
         * @type {(function():void)[]}
         */
        this.batch = [];

        /**
         * Is drawing enabled or not. As an optimization this is toggled off for invisible views.
         */
        let enabled = true;

        /**
         * @type {function(function():void):(function():void)}
         */
        const ifEnabled = op => () => {
            if (enabled) op();
        };

        // Group by marks in order to minimize program changes
        const requestByMark = group(this.buffer, request => request.mark);

        for (const [mark, requests] of requestByMark.entries()) {
            if (!mark.isReady()) {
                continue;
            }

            // eslint-disable-next-line no-loop-func
            this.batch.push(() => {
                enabled = mark.unitView.getEffectiveOpacity() > 0;
            });
            // Change program, set common uniforms (mark properties, shared domains)
            this.batch.push(ifEnabled(() => mark.prepareRender()));

            /** @type {import("../../utils/layout/rectangle").default} */
            let previousCoords;
            for (const request of requests) {
                const coords = request.coords;
                // Render each facet
                if (!coords.equals(previousCoords)) {
                    this.batch.push(ifEnabled(() => mark.setViewport(coords)));
                }
                this.batch.push(ifEnabled(request.callback));
                previousCoords = request.coords;
            }
        }
    }
}
