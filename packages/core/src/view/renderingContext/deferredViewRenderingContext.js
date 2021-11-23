import { group } from "d3-array";

import ViewRenderingContext from "./viewRenderingContext";

/**
 *
 * @typedef {object} DeferredRenderingRequest Allows for collecting marks for
 *      optimized rendering order.
 * @prop {import("../../marks/mark").default} mark
 * @prop {function():void} callback
 * @prop {import("../../utils/layout/rectangle").default} coords
 * @prop {import("../../utils/layout/rectangle").default} [clipRect]
 */
export default class DeferredViewRenderingContext extends ViewRenderingContext {
    /**
     * @param {import("../rendering").GlobalRenderingOptions} globalOptions
     * @param {import("../../gl/webGLHelper").default} webGLHelper
     */
    constructor(globalOptions, webGLHelper) {
        super(globalOptions);

        this.webGLHelper = webGLHelper;

        /**
         * @type {DeferredRenderingRequest[]}
         */
        this.buffer = [];

        /** @type {import("../../utils/layout/rectangle").default} */
        this.coords = undefined;

        /** @type {Set<import("../view").default>} */
        this.views = new Set();
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {import("../view").default} view
     * @param {import("../../utils/layout/rectangle").default} coords View coordinates
     *      inside the padding.
     */
    pushView(view, coords) {
        this.views.add(view);
        this.coords = coords;
    }

    /**
     *
     * @param {import("../../marks/mark").default} mark
     * @param {import("../view").RenderingOptions} options
     */
    renderMark(mark, options) {
        if (this.globalOptions.picking && !mark.isPickingParticipant()) {
            return;
        }

        const callback = mark.render(options);
        if (callback) {
            this.buffer.push({
                mark,
                callback,
                coords: this.coords,
                clipRect: options.clipRect,
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

        if (this.batch.length == 0) {
            return;
        }

        const gl = this.webGLHelper.gl;
        const picking = this.globalOptions.picking;

        gl.bindFramebuffer(
            gl.FRAMEBUFFER,
            picking ? this.webGLHelper._pickingBufferInfo.framebuffer : null
        );

        this.webGLHelper.clearAll();

        for (const view of this.views) {
            view.onBeforeRender();
        }

        // Execute the batch
        for (const op of this.batch) {
            op();
        }

        if (picking) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

        let viewportVisible = true;

        /**
         * @type {function(function():void):(function():void)}
         */
        const ifEnabled = (op) => () => {
            if (enabled) op();
        };

        /**
         * @type {function(function():void):(function():void)}
         */
        const ifEnabledAndVisible = (op) => () => {
            if (enabled && viewportVisible) op();
        };

        // Group by marks in order to minimize program changes
        const requestByMark = group(this.buffer, (request) => request.mark);

        for (const [mark, requests] of requestByMark.entries()) {
            if (!mark.isReady()) {
                continue;
            }

            // eslint-disable-next-line no-loop-func
            this.batch.push(() => {
                enabled = mark.unitView.getEffectiveOpacity() > 0;
            });
            // Change program, set common uniforms (mark properties, shared domains)
            this.batch.push(
                ifEnabled(() => mark.prepareRender(this.globalOptions))
            );

            /** @type {import("../../utils/layout/rectangle").default} */
            let previousCoords;
            for (const request of requests) {
                const coords = request.coords;
                // Render each facet
                if (!coords.equals(previousCoords)) {
                    this.batch.push(
                        // eslint-disable-next-line no-loop-func
                        ifEnabled(() => {
                            // Suppress rendering if viewport is outside the clipRect
                            viewportVisible = mark.setViewport(
                                coords,
                                request.clipRect
                            );
                        })
                    );
                }
                this.batch.push(ifEnabledAndVisible(request.callback));
                previousCoords = request.coords;
            }
        }
    }
}
