import View, { VISIT_STOP, VISIT_SKIP } from "./view";

/**
 * Compositor view represents a non-leaf node in the view hierarchy.
 */
export default class ContainerView extends View {
    /**
     *
     * @param {import("./viewUtils").ContainerSpec} spec
     * @param {import("./view").ViewContext} context
     * @param {ContainerView} parent
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
        // override
    }

    /**
     * Replaces a child view with another one. Does not set any references.
     *
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        throw new Error("Not implemented");
    }

    /**
     * Visits child views in depth-first order. Terminates the search and returns
     * the value if the visitor returns a defined value.
     *
     * @param {(function(View):("VISIT_SKIP"|"VISIT_STOP"|void)) & { afterChildren?: function}} visitor
     * @returns {any}
     */
    visit(visitor) {
        const result = super.visit(visitor);
        if (result === VISIT_STOP) {
            return result;
        }

        if (result !== VISIT_SKIP) {
            for (const view of this) {
                const result = view.visit(visitor);
                if (result === VISIT_STOP) {
                    return result;
                }
            }

            if (visitor.afterChildren) {
                visitor.afterChildren(this);
            }
        }
    }

    /**
     *
     * @param {string} name
     */
    findChildByName(name) {
        for (const child of this) {
            if (child.spec.name && child.spec.name === name) {
                return child;
            }
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
