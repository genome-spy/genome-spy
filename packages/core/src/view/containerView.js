import View, { VISIT_STOP, VISIT_SKIP } from "./view.js";

/**
 * Compositor view represents a non-leaf node in the view hierarchy.
 */
export default class ContainerView extends View {
    /** @type {Map<string, number>} */
    #autoNameCounters = new Map();

    /**
     *
     * @param {import("../spec/view.js").ContainerSpec} spec
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

    async initializeChildren() {
        // override
    }

    /**
     * Generates an auto name that is guaranteed to be unique within this container
     * for the given prefix. Intended for debugging-only default names.
     *
     * @param {string} prefix
     * @returns {string}
     */
    getNextAutoName(prefix) {
        const counter = this.#autoNameCounters.get(prefix) ?? 0;
        this.#autoNameCounters.set(prefix, counter + 1);
        return prefix + counter;
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        // override
    }

    /**
     * Visits child views in depth-first pre-order. Terminates the search and returns
     * the value if the visitor returns a defined value. The `afterChildren` callback
     * allows for post-order traversal
     *
     * @param {import("./view.js").Visitor} visitor
     * @returns {import("./view.js").VisitResult}
     */
    visit(visitor) {
        /** @type  {import("./view.js").VisitResult}*/
        let result;
        try {
            result = visitor(this);
        } catch (e) {
            // Augment the exception with the view
            e.view = this;
            throw e;
        }

        if (result === VISIT_STOP) {
            return result;
        }

        if (result !== VISIT_SKIP) {
            if (visitor.beforeChildren) {
                visitor.beforeChildren(this);
            }

            for (const view of this) {
                const result = view.visit(visitor);
                if (result === VISIT_STOP) {
                    return result;
                }
            }

            if (visitor.afterChildren) {
                visitor.afterChildren(this);
            }

            if (visitor.postOrder) {
                visitor.postOrder(this);
            }
        }
    }

    /**
     * @param {string[]} path An array of view names
     * @returns {View}
     */
    findDescendantByPath(path) {
        /** @type {View | ContainerView} */
        let current = this;

        for (let i = 0; i < path.length; i++) {
            if (!(current instanceof ContainerView)) {
                return;
            }

            const next = current.#findImmediateChildByName(path[i]);
            if (!next) {
                return;
            }

            if (i === path.length - 1) {
                return next;
            }

            current = next;
        }
    }

    /**
     * @param {string} name
     */
    #findImmediateChildByName(name) {
        for (const child of this) {
            if (child.name === name) {
                return child;
            }
        }
    }

    /**
     *
     * @param {string} name
     */
    findChildByName(name) {
        return this.#findImmediateChildByName(name);
    }

    /**
     *
     * @param {string} name
     */
    findDescendantByName(name) {
        /** @type {View} */
        let view;

        this.visit((v) => {
            if (v.name == name) {
                view = v;
                return VISIT_STOP;
            }
        });

        return view;
    }

    /**
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "shared";
    }
}
