import View from "./view";

/**
 * Compositor view represents a non-leaf node in the view hierarchy.
 */
export default class ContainerView extends View {
    /**
     *
     * @param {import("./viewUtils").ContainerSpec} spec
     * @param {import("./view").ViewContext} context
     * @param {import("./view").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec;
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        // abstract
    }

    /**
     * Visits child views in depth-first order. Terminates the search and returns
     * the value if the visitor returns a defined value.
     *
     * @param {(function(View):any) & { afterChildren?: function}} visitor
     * @returns {any}
     */
    visit(visitor) {
        const result = super.visit(visitor);
        if (result !== undefined) {
            return result;
        }

        for (const view of this) {
            const result = view.visit(visitor);
            if (result !== undefined) {
                return result;
            }
        }

        if (visitor.afterChildren) {
            visitor.afterChildren(this);
        }
    }

    /**
     * @param {string} channel
     */
    getConfiguredResolution(channel) {
        return (
            this.spec.resolve &&
            this.spec.resolve.scale &&
            this.spec.resolve.scale[channel]
        );
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return "shared";
    }

    /**
     * @param {string} channel
     */
    getConfiguredOrDefaultResolution(channel) {
        return (
            this.getConfiguredResolution(channel) ||
            this.getDefaultResolution(channel)
        );
    }
}
