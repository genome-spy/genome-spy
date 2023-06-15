import { isLayerSpec, isUnitSpec } from "./viewFactory";
import ContainerView from "./containerView";

export default class LayerView extends ContainerView {
    /**
     * @typedef {import("./view").default} View
     */
    /**
     *
     * @param {import("../spec/view").LayerSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view").default} dataParent
     * @param {string} name
     */
    constructor(spec, context, layoutParent, dataParent, name) {
        super(spec, context, layoutParent, dataParent, name);

        this.spec = spec;

        /** @type {(LayerView | import("./unitView").default)[]} */
        // @ts-expect-error TODO: Fix typing
        this.children = (spec.layer || []).map((childSpec, i) => {
            if (isLayerSpec(childSpec) || isUnitSpec(childSpec)) {
                return context.createView(childSpec, this, this, "layer" + i);
            } else {
                throw new Error(
                    "LayerView accepts only unit or layer specs as children!"
                );
            }
        });

        this.needsAxes = { x: true, y: true };
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const child of this.children) {
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

        for (const child of this.children) {
            child.render(context, coords, options);
        }

        context.popView(this);
    }

    /**
     * @param {import("../utils/interactionEvent").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);
        for (let i = this.children.length - 1; i >= 0; i--) {
            this.children[i].propagateInteractionEvent(event);
            if (event.stopped) {
                return;
            }
        }
        this.handleInteractionEvent(undefined, event, false);
    }
}
