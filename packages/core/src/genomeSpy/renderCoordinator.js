import BufferedViewRenderingContext from "../view/renderingContext/bufferedViewRenderingContext.js";
import CompositeViewRenderingContext from "../view/renderingContext/compositeViewRenderingContext.js";
import Rectangle from "../view/layout/rectangle.js";

export default class RenderCoordinator {
    /** @type {import("../view/view.js").default} */
    #viewRoot;
    /** @type {import("../gl/webGLHelper.js").default} */
    #glHelper;
    /** @type {() => string} */
    #getBackground;
    /** @type {(type: import("../genomeSpy.js").BroadcastEventType, payload?: any) => void} */
    #broadcast;
    /** @type {() => void} */
    #onLayoutComputed;
    /** @type {BufferedViewRenderingContext} */
    #renderingContext;
    /** @type {BufferedViewRenderingContext} */
    #pickingContext;
    /** @type {boolean} */
    #dirtyPickingBuffer;
    /**
     * @param {object} options
     * @param {import("../view/view.js").default} options.viewRoot
     * @param {import("../gl/webGLHelper.js").default} options.glHelper
     * @param {() => string} options.getBackground
     * @param {(type: import("../genomeSpy.js").BroadcastEventType, payload?: any) => void} options.broadcast
     * @param {() => void} options.onLayoutComputed
     */
    constructor({
        viewRoot,
        glHelper,
        getBackground,
        broadcast,
        onLayoutComputed,
    }) {
        this.#viewRoot = viewRoot;
        this.#glHelper = glHelper;
        this.#getBackground = getBackground;
        this.#broadcast = broadcast;
        this.#onLayoutComputed = onLayoutComputed;

        /** @type {BufferedViewRenderingContext} */
        this.#renderingContext = undefined;
        /** @type {BufferedViewRenderingContext} */
        this.#pickingContext = undefined;

        /** Does picking buffer need to be rendered again */
        this.#dirtyPickingBuffer = false;
    }

    computeLayout() {
        const root = this.#viewRoot;
        if (!root) {
            return;
        }

        this.#broadcast("layout");

        const canvasSize = this.#glHelper.getLogicalCanvasSize();

        if (isNaN(canvasSize.width) || isNaN(canvasSize.height)) {
            // TODO: Figure out what causes this
            console.log(
                `NaN in canvas size: ${canvasSize.width}x${canvasSize.height}. Skipping computeLayout().`
            );
            return;
        }

        const commonOptions = {
            webGLHelper: this.#glHelper,
            canvasSize,
            devicePixelRatio: window.devicePixelRatio ?? 1,
        };

        this.#renderingContext = new BufferedViewRenderingContext(
            { picking: false },
            {
                ...commonOptions,
                clearColor: this.#getBackground(),
            }
        );
        this.#pickingContext = new BufferedViewRenderingContext(
            { picking: true },
            {
                ...commonOptions,
                framebufferInfo: this.#glHelper._pickingBufferInfo,
            }
        );

        root.render(
            new CompositeViewRenderingContext(
                this.#renderingContext,
                this.#pickingContext
            ),
            // Canvas should now be sized based on the root view or the container
            Rectangle.create(0, 0, canvasSize.width, canvasSize.height)
        );

        this.#onLayoutComputed();
        this.#broadcast("layoutComputed");
    }

    renderAll() {
        this.#renderingContext?.render();

        this.#dirtyPickingBuffer = true;
    }

    renderPickingFramebuffer() {
        if (!this.#dirtyPickingBuffer) {
            return;
        }

        this.#pickingContext.render();
        this.#dirtyPickingBuffer = false;
    }
}
