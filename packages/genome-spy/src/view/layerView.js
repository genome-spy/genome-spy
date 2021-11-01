import { isLayerSpec, isUnitSpec } from "./viewFactory";
import ContainerView from "./containerView";

/**
 * @typedef {import("./view").default} View
 */
export default class LayerView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").LayerSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {ContainerView} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec;

        /** @type {(LayerView | import("./unitView").default)[]} */
        this.children = (spec.layer || []).map((childSpec, i) => {
            if (isLayerSpec(childSpec) || isUnitSpec(childSpec)) {
                return context.createView(childSpec, this, "layer" + i);
            } else {
                throw new Error(
                    "LayerView accepts only unit or layer specs as children!"
                );
            }
        });
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
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        for (const child of this.children) {
            child.render(context, coords, options);
        }

        context.popView(this);
    }
}
