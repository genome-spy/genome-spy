import { group } from "d3-array";

import ViewRenderingContext from "../../view/renderingContext/viewRenderingContext.js";
import { color } from "d3-color";
import {
    clipOptionsEqual,
    normalizeClipOptions,
    prepareMarkClipOptionsFromClip,
} from "../../view/renderingContext/clipOptions.js";

/**
 * @typedef {object} BufferedViewRenderingOptions
 * @prop {import("./gl/webGLHelper.js").default} webGLHelper
 * @prop {import("./rendererResources.js").default} markAdapter
 * @prop {{width: number, height: number}} canvasSize Size of the canvas in logical pixels.
 * @prop {number} devicePixelRatio
 * @prop {import("twgl.js").FramebufferInfo} [framebufferInfo]
 * @prop {string} [clearColor] Clear color for the  WebGL context,
 *      defaults to transparent black.
 * @prop {(mark: import("../../marks/mark.js").default) => boolean} [markPredicate]
 * @prop {number} [pixelOffset] Logical-pixel offset applied to WebGL marks.
 */

/**
 * @typedef {object} BufferedRenderingRequest
 * @prop {import("../../marks/mark.js").default} mark
 * @prop {import("../../view/layout/rectangle.js").default} coords
 * @prop {import("../../types/rendering.js").RenderingOptions} options
 * @prop {import("../../types/rendering.js").PlacementRenderingOptions} [placement]
 * @prop {import("../../types/rendering.js").ClipOptions} [clip]
 * @prop {import("../../types/rendering.js").ClipOptions} [cullClip]
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

    /** @type {BufferedRenderingRequest[]} */
    #buffer = [];

    /** @type {import("twgl.js").FramebufferInfo} */
    #framebufferInfo;

    /** @type {import("./gl/webGLHelper.js").default} */
    #webGLHelper;

    /** @type {import("./rendererResources.js").default} */
    #markAdapter;

    /** @type {Set<import("./rendererResources.js").WebGLMarkEntry>} */
    #entries = new Set();

    /** @type {Set<import("../../view/view.js").default>} */
    #views = new Set();

    /** @type {(mark: import("../../marks/mark.js").default) => boolean} */
    #markPredicate;

    /** @type {import("../../view/layout/rectangle.js").default} */
    #coords = undefined;

    #dpr = 1;
    #canvasSize = { width: 0, height: 0 };

    /** @type {number | undefined} */
    #pixelOffset;

    /**
     * @param {import("../../types/rendering.js").GlobalRenderingOptions} globalOptions
     * @param {BufferedViewRenderingOptions} bufferedOptions
     */
    constructor(globalOptions, bufferedOptions) {
        super(globalOptions);

        this.#webGLHelper = bufferedOptions.webGLHelper;
        this.#markAdapter = bufferedOptions.markAdapter;
        this.#framebufferInfo = bufferedOptions.framebufferInfo;
        this.#dpr = bufferedOptions.devicePixelRatio;
        this.#canvasSize = bufferedOptions.canvasSize;
        this.#markPredicate = bufferedOptions.markPredicate ?? (() => true);
        this.#pixelOffset = bufferedOptions.pixelOffset;

        if (bufferedOptions.clearColor) {
            const c = color(bufferedOptions.clearColor).rgb();
            this.#clearColor = [c.r / 255, c.g / 255, c.b / 255, c.opacity];
        }
    }

    getDevicePixelRatio() {
        return this.#dpr;
    }

    /**
     * Must be called when a view layout placement is entered
     *
     * @param {import("../../view/view.js").default} view
     * @param {import("../../view/layout/rectangle.js").default} coords View coordinates
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
        if (!this.#markPredicate(mark)) {
            return;
        }
        if (this.globalOptions.picking && !mark.isPickingParticipant()) {
            return;
        }

        const inheritedClip = normalizeClipOptions(options);
        this.#buffer.push({
            mark,
            options,
            coords: this.#coords,
            placement: options.placement,
            clip: prepareMarkClipOptionsFromClip(
                inheritedClip,
                mark.properties.clip,
                this.#coords
            ),
            cullClip: inheritedClip,
        });
    }

    /**
     * Renders marks in an optimized order, minimizing the number of WebGL state
     * changes.
     */
    render() {
        this.finish();

        this.#markAdapter.synchronize(this.#entries);

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

    finish() {
        if (!this.#batch) {
            const marks = this.#buffer.map((request) => request.mark);
            this.#markAdapter.prepareMarks(marks);
            this.#markAdapter.synchronize(
                marks
                    .map((mark) => this.#markAdapter.getMarkEntry(mark))
                    .filter((entry) => entry)
            );
            this.#buildBatch();
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
            const entry = this.#markAdapter.getMarkEntry(mark);
            if (!entry) {
                continue;
            }
            const graphics = entry.graphics;
            if (!this.#markAdapter.isEntryDrawable(entry)) {
                continue;
            }
            this.#entries.add(entry);

            const drawableRequests = requests
                .map((request) => ({
                    ...request,
                    callback: graphics.render(request.options),
                }))
                .filter((request) => request.callback);
            if (drawableRequests.length == 0) {
                continue;
            }

            this.#batch.push(() => {
                enabled =
                    this.#markAdapter.isEntryDrawable(entry) &&
                    mark.unitView.getEffectiveOpacity() > 0;
            });
            // Change program, set common uniforms (mark properties, shared domains)
            const placement = drawableRequests[0].placement;
            const prepareOptions = placement
                ? { ...this.globalOptions, placement }
                : this.globalOptions;
            this.#batch.push(
                ...graphics
                    .prepareRender(prepareOptions)
                    .map((op) => ifEnabled(op))
            );

            /** @type {import("../../view/layout/rectangle.js").default} */
            let previousCoords;
            /** @type {import("../../types/rendering.js").ClipOptions | undefined} */
            let previousClip;
            /** @type {import("../../types/rendering.js").ClipOptions | undefined} */
            let previousCullClip;
            for (const request of drawableRequests) {
                const coords = request.coords;
                // Render each facet
                if (
                    !coords.equals(previousCoords) ||
                    !clipOptionsEqual(request.clip, previousClip) ||
                    !clipOptionsEqual(request.cullClip, previousCullClip)
                ) {
                    this.#batch.push(
                        ifEnabled(() => {
                            // Suppress rendering if viewport is outside the clip.
                            viewportVisible = graphics.setViewport(
                                this.#canvasSize,
                                this.#dpr,
                                coords,
                                request.clip,
                                request.cullClip,
                                this.#pixelOffset
                            );
                        })
                    );
                }
                this.#batch.push(
                    ifEnabledAndVisible(
                        /** @type {() => void} */ (request.callback)
                    )
                );
                previousCoords = request.coords;
                previousClip = request.clip;
                previousCullClip = request.cullClip;
            }
        }
    }
}
