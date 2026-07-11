import LayerView from "./layerView.js";
import { getMultiscaleStageTransitionParam } from "./multiscale.js";

/**
 * A generated multiscale stage that registers its opacity parameter after
 * scale resolution and enables transitions after initial layout and data load.
 *
 * @extends {LayerView<import("../spec/view.js").LayerSpec>}
 */
export default class MultiscaleStageView extends LayerView {
    /** @type {import("../spec/parameter.js").ExprParameter | undefined} */
    #transitionParam;

    #hasLaidOut = false;

    #isDataReady = false;

    #isTransitionInitialized = false;

    /**
     * @param {import("../spec/view.js").LayerSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, options);
        this.#transitionParam = getMultiscaleStageTransitionParam(spec);
    }

    configureViewOpacity() {
        if (
            this.#transitionParam &&
            !this.paramRuntime.hasLocalParam(this.#transitionParam.name)
        ) {
            this.paramRuntime.registerParam(this.#transitionParam);
            this.registerDisposer(
                this._addBroadcastHandler("subtreeDataReady", () => {
                    this.#isDataReady = true;
                    this.#finalizeTransitionInitialization();
                })
            );
        }

        super.configureViewOpacity();
    }

    finalizeParamRuntimeInitialization() {
        if (!this.#transitionParam) {
            super.finalizeParamRuntimeInitialization();
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (this.#transitionParam) {
            this.#hasLaidOut = true;
            this.#finalizeTransitionInitialization();
        }
    }

    #finalizeTransitionInitialization() {
        if (
            !this.#isTransitionInitialized &&
            this.#hasLaidOut &&
            this.#isDataReady
        ) {
            this.#isTransitionInitialized = true;
            this.paramRuntime.finalizeInitialization();
        }
    }
}
