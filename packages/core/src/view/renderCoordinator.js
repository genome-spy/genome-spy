import BufferedViewRenderingContext from "./renderingContext/bufferedViewRenderingContext.js";
import CompositeViewRenderingContext from "./renderingContext/compositeViewRenderingContext.js";
import Rectangle from "./layout/rectangle.js";

export default class RenderCoordinator {
    /**
     * @param {object} options
     * @param {import("./view.js").default} options.viewRoot
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
        this._viewRoot = viewRoot;
        this._glHelper = glHelper;
        this._getBackground = getBackground;
        this._broadcast = broadcast;
        this._onLayoutComputed = onLayoutComputed;

        /** @type {BufferedViewRenderingContext} */
        this._renderingContext = undefined;
        /** @type {BufferedViewRenderingContext} */
        this._pickingContext = undefined;

        /** Does picking buffer need to be rendered again */
        this._dirtyPickingBuffer = false;
    }

    computeLayout() {
        const root = this._viewRoot;
        if (!root) {
            return;
        }

        this._broadcast("layout");

        const canvasSize = this._glHelper.getLogicalCanvasSize();

        if (isNaN(canvasSize.width) || isNaN(canvasSize.height)) {
            // TODO: Figure out what causes this
            console.log(
                `NaN in canvas size: ${canvasSize.width}x${canvasSize.height}. Skipping computeLayout().`
            );
            return;
        }

        const commonOptions = {
            webGLHelper: this._glHelper,
            canvasSize,
            devicePixelRatio: window.devicePixelRatio ?? 1,
        };

        this._renderingContext = new BufferedViewRenderingContext(
            { picking: false },
            {
                ...commonOptions,
                clearColor: this._getBackground(),
            }
        );
        this._pickingContext = new BufferedViewRenderingContext(
            { picking: true },
            {
                ...commonOptions,
                framebufferInfo: this._glHelper._pickingBufferInfo,
            }
        );

        root.render(
            new CompositeViewRenderingContext(
                this._renderingContext,
                this._pickingContext
            ),
            // Canvas should now be sized based on the root view or the container
            Rectangle.create(0, 0, canvasSize.width, canvasSize.height)
        );

        this._onLayoutComputed();
        this._broadcast("layoutComputed");
    }

    renderAll() {
        this._renderingContext?.render();

        this._dirtyPickingBuffer = true;
    }

    renderPickingFramebuffer() {
        if (!this._dirtyPickingBuffer) {
            return;
        }

        this._pickingContext.render();
        this._dirtyPickingBuffer = false;
    }
}
