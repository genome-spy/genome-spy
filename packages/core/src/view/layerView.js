import { isLayerSpec, isUnitSpec } from "./viewFactory.js";
import ContainerView from "./containerView.js";
import ViewError from "../utils/viewError.js";

export default class LayerView extends ContainerView {
    /**
     * @typedef {import("./view").default} View
     */

    /** @type {(LayerView | import("./unitView").default)[]} */
    #children = [];

    /**
     *
     * @param {import("../spec/view").LayerSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view").default} dataParent
     * @param {string} name
     * @param {import("./view").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, options);

        this.spec = spec;

        this.needsAxes = { x: true, y: true };
    }

    /**
     * @override
     */
    async initializeChildren() {
        this.#children = await Promise.all(
            this.spec.layer.map(
                (childSpec, i) =>
                    /** @type {(Promise<LayerView | import("./unitView").default>)} */ (
                        this.context.createOrImportView(
                            childSpec,
                            this,
                            this,
                            "grid" + i,
                            (importedSpec) => {
                                if (
                                    !isLayerSpec(importedSpec) &&
                                    !isUnitSpec(importedSpec)
                                ) {
                                    throw new ViewError(
                                        "LayerView accepts only unit or layer specs as children!",
                                        this
                                    );
                                    // TODO: Add view to exception
                                }
                            }
                        )
                    )
            )
        );
    }

    get children() {
        return this.#children.slice();
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const child of this.#children) {
            yield child;
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("../types/rendering").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        if (!this.isConfiguredVisible()) {
            return;
        }

        context.pushView(this, coords);

        for (const child of this.#children) {
            child.render(context, coords, options);
        }

        context.popView(this);
    }

    /**
     * @param {import("../utils/interactionEvent").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);
        for (let i = this.#children.length - 1; i >= 0; i--) {
            this.#children[i].propagateInteractionEvent(event);
            if (event.stopped) {
                return;
            }
        }
        this.handleInteractionEvent(undefined, event, false);
    }
}
