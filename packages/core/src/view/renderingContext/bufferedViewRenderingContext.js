import { group } from "d3-array";

import ViewRenderingContext from "./viewRenderingContext.js";
import { color } from "d3-color";

/**
 * @typedef {object} BufferedViewRenderingOptions
 * @prop {import("../../gl/webGLHelper.js").default} webGLHelper
 * @prop {{width: number, height: number}} canvasSize Size of the canvas in logical pixels.
 * @prop {number} devicePixelRatio
 * @prop {import("twgl.js").FramebufferInfo} [framebufferInfo]
 * @prop {string} [clearColor] Clear color for the  WebGL context,
 *      defaults to transparent black.
 */

/**
 * View rendering context that buffers the actual WebGL rendering for
 * efficient animation.
 */
export default class BufferedViewRenderingContext extends ViewRenderingContext {
    /** @type {[number, number, number, number]} */
    #clearColor = [0, 0, 0, 0];

    /** @type {(() => void)[]} */
    #batch;

    /**
     * @type {import("../../types/rendering.js").BufferedRenderingRequest[]}
     */
    #buffer = [];

    /** @type {import("twgl.js").FramebufferInfo} */
    #framebufferInfo;

    /** @type {import("../../gl/webGLHelper.js").default} */
    #webGLHelper;

    /** @type {Set<import("../view.js").default>} */
    #views = new Set();

    /** @type {import("../layout/rectangle.js").default} */
    #coords = undefined;

    #dpr = 1;
    #canvasSize = { width: 0, height: 0 };

    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     * @param {BufferedViewRenderingOptions} bufferedOptions
     */
    constructor(globalOptions, bufferedOptions) {
        super(globalOptions);

        this.#webGLHelper = bufferedOptions.webGLHelper;
        this.#framebufferInfo = bufferedOptions.framebufferInfo;
        this.#dpr = bufferedOptions.devicePixelRatio;
        this.#canvasSize = bufferedOptions.canvasSize;

        if (bufferedOptions.clearColor) {
            const c = color(bufferedOptions.clearColor).rgb();
            this.#clearColor = [c.r / 255, c.g / 255, c.b / 255, c.opacity];
        }
    }

    /**
     * Must be called when a view's render() method is entered
     *
     * @param {import("../view.js").default} view
     * @param {import("../layout/rectangle.js").default} coords View coordinates
     *      inside the padding.
     * @override
     */
    pushView(view, coords) {
        this.#views.add(view);
        this.#coords = coords;
    }

    /**
     *
     * @param {import("../../marks/mark.js").default} mark
     * @param {import("../../types/rendering.js").RenderingOptions} options
     * @override
     */
    renderMark(mark, options) {
        if (this.globalOptions.picking && !mark.isPickingParticipant()) {
            return;
        }

        const callback = mark.render(options);
        if (callback) {
            this.#buffer.push({
                mark,
                callback,
                coords: this.#coords,
                clipRect: options.clipRect,
            });
        }
    }

    /**
     * Renders marks in an optimized order, minimizing the number of WebGL state
     * changes.
     */
    render() {
        if (!this.#batch) {
            this.#buildBatch();
        }

        if (this.#batch.length == 0) {
            return;
        }

        const gl = this.#webGLHelper.gl;
        const fbi = this.#framebufferInfo;

        if (fbi) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbi.framebuffer);
            gl.viewport(0, 0, fbi.width, fbi.height);
        } else {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }

        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(...this.#clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT);

        for (const view of this.#views) {
            view.onBeforeRender();
        }

        // Execute the batch
        for (const op of this.#batch) {
            op();
        }

        if (this.#framebufferInfo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
    }

    #buildBatch() {
        /**
         * Store the operations as a sequence of commands for cheap subsequent rendering.
         */
        this.#batch = [];

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

        // We group by marks in order to minimize program changes.
        // Note: by reversing the buffer, we ensure ensure that the last instance
        // of a mark determines the order of the groups.
        const requestByMark = group(
            this.#buffer.reverse(),
            (request) => request.mark
        );

        // And reversing again to restore the original order
        for (const [mark, requests] of [...requestByMark.entries()].reverse()) {
            if (!mark.isReady()) {
                continue;
            }

            // eslint-disable-next-line no-loop-func
            this.#batch.push(() => {
                enabled = mark.unitView.getEffectiveOpacity() > 0;
            });
            // Change program, set common uniforms (mark properties, shared domains)
            this.#batch.push(
                ...mark
                    .prepareRender(this.globalOptions)
                    .map((op) => ifEnabled(op))
            );

            /** @type {import("../layout/rectangle.js").default} */
            let previousCoords;
            for (const request of requests) {
                const coords = request.coords;
                // Render each facet
                if (!coords.equals(previousCoords)) {
                    this.#batch.push(
                        // eslint-disable-next-line no-loop-func
                        ifEnabled(() => {
                            // Suppress rendering if viewport is outside the clipRect
                            viewportVisible = mark.setViewport(
                                this.#canvasSize,
                                this.#dpr,
                                coords,
                                request.clipRect
                            );
                        })
                    );
                }
                this.#batch.push(ifEnabledAndVisible(request.callback));
                previousCoords = request.coords;
            }
        }
    }
}
