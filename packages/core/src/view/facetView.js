import ContainerView from "./containerView.js";

/**
 * Repeats a single child view for data-driven facet groups.
 *
 * The implementation is restored incrementally. The current shell exists so
 * facet specs can participate in view-factory registration and root wrapping.
 *
 * @extends {ContainerView<import("../spec/view.js").FacetSpec>}
 */
export default class FacetView extends ContainerView {
    /**
     * @param {import("../spec/view.js").FacetSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, options);

        this.spec = spec;
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        // Children are added in the implementation tasks that follow factory
        // registration.
    }
}
