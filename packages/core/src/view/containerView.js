import View, { VISIT_STOP, VISIT_SKIP } from "./view.js";

/**
 * Compositor view represents a non-leaf node in the view hierarchy.
 *
 * @template {import("../spec/view.js").ContainerSpec} [TSpec=import("../spec/view.js").ContainerSpec]
 * @extends {View<TSpec>}
 */
export default class ContainerView extends View {
    /** @type {Map<string, number>} */
    #autoNameCounters = new Map();

    async initializeChildren() {
        // override
    }

    /**
     * Adopts all successful children before reporting a sibling's failure so
     * factory cleanup disposes their outputs together with the owning parent.
     *
     * @template {View} T
     * @param {Promise<T>[]} pendingChildren
     * @param {(children: T[]) => void} adoptChildren
     */
    async createChildViews(pendingChildren, adoptChildren) {
        const results = await Promise.allSettled(pendingChildren);
        const children = results
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value);
        const failure = results.find((result) => result.status === "rejected");

        adoptChildren(children);
        if (failure) throw failure.reason;
    }

    /**
     * Materializes guides after the authored hierarchy's resolutions are ready.
     * @param {{ legendOwners?: View[] }} [_options]
     */
    async syncGuideViews(_options) {
        // override when this container owns guides
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

        for (const name of path) {
            if (!(current instanceof ContainerView)) {
                return;
            }

            current = Iterator.from(current).find(
                (child) => child.name === name
            );
        }
        return path.length ? current : undefined;
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
