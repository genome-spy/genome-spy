import { isLayerSpec, isUnitSpec } from "./viewFactory.js";
import ContainerView from "./containerView.js";
import ViewError from "./viewError.js";
import ContainerMutationHelper from "./containerMutationHelper.js";
import { isMultiscaleSpec } from "./multiscale.js";

export default class LayerView extends ContainerView {
    /**
     * @typedef {import("./view.js").default} View
     */

    /** @type {(LayerView | import("./unitView.js").default)[]} */
    #children = [];

    /**
     *
     * @param {import("../spec/view.js").LayerSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, {
            layersChildren: true,
            ...options,
        });

        this.spec = spec;

        this.needsAxes = { x: true, y: true };
    }

    /**
     * @override
     */
    async initializeChildren() {
        this.#children = await Promise.all(
            this.spec.layer.map(
                (childSpec) =>
                    /** @type {(Promise<LayerView | import("./unitView.js").default>)} */ (
                        this.context.createOrImportView(
                            childSpec,
                            this,
                            this,
                            this.getNextAutoName("layer"),
                            (importedSpec) => {
                                if (
                                    !isLayerSpec(importedSpec) &&
                                    !isUnitSpec(importedSpec) &&
                                    !isMultiscaleSpec(importedSpec)
                                ) {
                                    throw new ViewError(
                                        "LayerView accepts only unit, layer, or multiscale specs as children!",
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

    /**
     * Adds a child spec dynamically. Intended for post-initialization updates.
     *
     * @param {import("../spec/view.js").LayerSpec | import("../spec/view.js").UnitSpec | import("../spec/view.js").ImportSpec} childSpec
     * @param {number} [index]
     * @returns {Promise<LayerView | import("./unitView.js").default>}
     */
    async addChildSpec(childSpec, index) {
        return /** @type {Promise<LayerView | import("./unitView.js").default>} */ (
            this.#getMutationHelper().addChildSpec(childSpec, index)
        );
    }

    /**
     * Removes a child by index. Intended for post-initialization updates.
     *
     * @param {number} index
     */
    async removeChildAt(index) {
        await this.#getMutationHelper().removeChildAt(index);
    }

    /**
     * @returns {ContainerMutationHelper}
     */
    #getMutationHelper() {
        return new ContainerMutationHelper(this, {
            getChildSpecs: () => ({
                specs: this.spec.layer,
                insertAt: (index, spec) => {
                    this.spec.layer.splice(
                        index,
                        0,
                        /** @type {import("../spec/view.js").LayerSpec | import("../spec/view.js").UnitSpec | import("../spec/view.js").ImportSpec} */ (
                            spec
                        )
                    );
                },
                removeAt: (index) => {
                    this.spec.layer.splice(index, 1);
                },
            }),
            insertView: (view, index) => {
                view.layoutParent ??= this;
                this.#children.splice(
                    index,
                    0,
                    /** @type {LayerView | import("./unitView.js").default} */ (
                        view
                    )
                );
                return view;
            },
            removeView: (index) => {
                const view = this.#children[index];
                if (!view) {
                    throw new Error("Child index out of range!");
                }
                view.disposeSubtree();
                this.#children.splice(index, 1);
            },
            defaultName: () => this.getNextAutoName("layer"),
        });
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
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

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
     * @param {import("../utils/interactionEvent.js").default} event
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
