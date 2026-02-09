import { range } from "d3-array";

/**
 * The FlowNode clones the data objects passing through or creates entirely
 * new objects.
 */
export const BEHAVIOR_CLONES = 1 << 0;

/**
 * FlowNode modifies the objects that pass through. Creating defensive copies
 * (clones) in an upstream node may be appropriate, depending on branching.
 */
export const BEHAVIOR_MODIFIES = 1 << 1;

/**
 * The flow node collects data objects and may emit the to its children.
 * The collected data objects must not be modified by downstream transforms.
 */
export const BEHAVIOR_COLLECTS = 1 << 2;

/**
 * @typedef {{paramRuntime?: import("../view/paramMediator.js").default}} ParamMediatorProvider
 */

/**
 * This is heavily inspired by Vega's and Vega-Lite's data flow system.
 *
 * @typedef {Record<string, any>} Datum
 * @typedef {Datum[]} Data
 */
export default class FlowNode {
    stats = {
        count: 0,
        /** @type {Datum} */
        first: null,
    };

    /** @type {boolean} */
    #initialized = false;

    /**
     * An object that provides a paramRuntime. (Most likely a View)
     *
     * @type {ParamMediatorProvider}
     */
    paramMediatorProvider = null;

    get behavior() {
        return 0;
    }

    /**
     * A human-readable label for the node. Used for debugging and logging.
     *
     * @returns {string}
     */
    get label() {
        return `(${this.constructor.name})`;
    }

    /**
     * @param {ParamMediatorProvider} [paramMediatorProvider]
     */
    constructor(paramMediatorProvider) {
        this.paramMediatorProvider = paramMediatorProvider;

        /** @type {FlowNode[]} */
        this.children = [];

        /** @type {FlowNode} */
        this.parent = undefined;

        /** True if all data have been processed */
        this.completed = false;
    }

    /**
     * Resets the node and all its descendants to their initial state, i.e., preparing
     * for a new batch of data.
     */
    reset() {
        this.completed = false;

        for (const child of this.children) {
            child.reset();
        }

        this.stats.count = 0;
        this.stats.first = null;
    }

    /**
     * Allows for doing final initialization after the flow structure has been
     * built and optimized. Must be called before any data are to be propagated.
     * Note: Some transforms call initialize() from reset() to rebuild internal
     * fast paths per batch. Use initializeOnce() for graph-level init to avoid
     * double-initialization issues.
     */
    initialize() {
        // override
    }

    /**
     * Calls initialize() once per node instance. Intended for graph-level init
     * passes that should not rerun when reusing existing branches.
     */
    initializeOnce() {
        if (this.#initialized) {
            return;
        }
        this.initialize();
        this.#initialized = true;
    }

    /**
     * Dynamically updates the propagator method to allow the JavaScript engine
     * to employ optimizations such as inlining.
     */
    #updatePropagator() {
        this._propagate = Function(
            "children",
            "stats",
            range(this.children.length)
                .map((i) => `const child${i} = children[${i}];`)
                .join("\n") +
                `return function propagate(datum) {
                    if (stats.count === 0) {
                        stats.first = structuredClone(datum);
                    }
                    stats.count++;
                ${range(this.children.length)
                    .map((i) => `child${i}.handle(datum);`)
                    .join("\n")}
                };`
        )(this.children, this.stats);
    }

    /**
     *
     * @param {FlowNode} parent
     */
    setParent(parent) {
        this.parent = parent;
    }

    /**
     *
     * @param {FlowNode} child
     */
    addChild(child) {
        if (child.parent) {
            throw new Error("Cannot add the child! It already has a parent.");
        }
        this.children.push(child);
        child.setParent(this);
        this.#updatePropagator();
        return this;
    }

    /**
     * @param {FlowNode} node
     */
    adopt(node) {
        if (node.parent) {
            node.parent.removeChild(node);
        }

        this.addChild(node);
    }

    /**
     * @param {FlowNode} otherParent
     */
    adoptChildrenOf(otherParent) {
        for (const child of otherParent.children) {
            this.adopt(child);
        }
    }

    /**
     * @param {FlowNode} newParent
     */
    insertAsParent(newParent) {
        if (this.isRoot()) {
            // Root should always be a data source
            throw new Error("Cannot insert a new parent for a root node!");
        }

        newParent.parent = this.parent;
        this.parent.children[this.parent.children.indexOf(this)] = newParent;
        this.parent.#updatePropagator();
        this.parent = undefined;
        newParent.addChild(this);
    }

    /**
     *
     * @param {FlowNode} child
     */
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            child.parent = undefined;
            this.#updatePropagator();
        } else {
            throw new Error("Trying to remove an unknown child node!");
        }
    }

    /**
     * Removes this node and ligates (connects) the preceding and succeeding nodes.
     */
    excise() {
        if (this.isRoot()) {
            // TODO: Implement
            throw new Error("Cannot excise root node!");
        } else if (this.isTerminal()) {
            this.parent.removeChild(this);
        } else if (this.children.length == 1) {
            const child = this.children[0];
            child.setParent(this.parent);
            this.parent.children[this.parent.children.indexOf(this)] = child;
            this.parent.#updatePropagator();
            this.setParent(undefined);
            this.children.length = 0;
        } else {
            // TODO: Implement
            throw new Error("Cannot excise a node that has multiple children!");
        }
    }

    isRoot() {
        return !this.parent;
    }

    isBranching() {
        return this.children.length > 1;
    }

    isTerminal() {
        return this.children.length == 0;
    }

    /**
     * Visits child nodes in depth-first order.
     *
     * @param {(function(FlowNode):void) & { afterChildren?: function(FlowNode):void}} visitor
     */
    visit(visitor) {
        // pre-order
        visitor(this);

        for (const child of this.children) {
            child.visit(visitor);
        }

        // post-oder
        if (visitor.afterChildren) {
            visitor.afterChildren(this);
        }
    }

    /**
     * @param {number} [depth]
     * @returns {string}
     */
    subtreeToString(depth = 0) {
        const childTree = this.children
            .map((child) => child.subtreeToString(depth + 1))
            .join("");
        return `${" ".repeat(depth * 2)}* ${this.label}${
            "identifier" in this && this.identifier
                ? ": " + this.identifier
                : ""
        } \n${childTree}`;
    }

    /**
     *
     * @param {Datum} datum
     */
    handle(datum) {
        // Default implementation just passes through
        this._propagate(datum);
    }

    complete() {
        this.completed = true;

        for (const child of this.children) {
            child.complete();
        }
    }

    /**
     * Signals that a new batch of data will be propagated.
     *
     * @param {import("../types/flowBatch.js").FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        for (const child of this.children) {
            child.beginBatch(flowBatch);
        }
    }

    /**
     * @returns {import("../view/paramMediator.js").default}
     * @protected
     */
    get paramRuntime() {
        if (this.paramMediatorProvider) {
            if (this.paramMediatorProvider.paramRuntime) {
                return this.paramMediatorProvider.paramRuntime;
            }
        }

        if (!this.parent) {
            throw new Error("Cannot find paramRuntime!");
        }
        return this.parent.paramRuntime;
    }

    /**
     * Repropagates the stored data. If this node has no stored data,
     * find the nearest ancestor that has and repropagate from there.
     * @protected
     */
    repropagate() {
        if (this.parent) {
            this.parent.repropagate();
        } else {
            throw new Error(
                "Cannot repropagate data, no FlowNode with stored data found!"
            );
        }
    }

    /**
     * @param {Datum} datum
     * @protected
     */
    _propagate(datum) {
        // Implementation is set dynamically in add/removeChild
    }
}

/**
 * @param {import("../types/flowBatch.js").FlowBatch} flowBatch
 * @returns {flowBatch is import("../types/flowBatch.js").FileBatch}
 */
export function isFileBatch(flowBatch) {
    return flowBatch.type == "file";
}

/**
 * @param {import("../types/flowBatch.js").FlowBatch} flowBatch
 * @returns {flowBatch is import("../types/flowBatch.js").FacetBatch}
 */
export function isFacetBatch(flowBatch) {
    return flowBatch.type == "facet";
}
