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

const ROOT_CONTEXT_OBJECT = {};
/**
 * This is heavily inspired by Vega's and Vega-Lite's data flow system.
 *
 * @typedef {import("./flowBatch").FlowBatch} FlowBatch
 *
 * @typedef {Record<string, any>} Datum
 * @typedef {Datum[]} Data
 */
export default class FlowNode {
    get behavior() {
        return 0;
    }

    constructor() {
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
    }

    /**
     * Allows for doing final initialization after the flow structure has been
     * built and optimized. Must be called before any data are to be propagated.
     */
    initialize() {
        // override
    }

    /**
     * Dynamically updates the propagator method to allow the JavaScript engine
     * to employ optimizations such as inlining.
     */
    _updatePropagator() {
        this._propagate = Function(
            "children",
            range(this.children.length)
                .map(i => `const child${i} = children[${i}];`)
                .join("\n") +
                `return function propagate(datum) {${range(this.children.length)
                    .map(i => `child${i}.handle(datum);`)
                    .join("\n")}}`
        )(this.children);
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
        this._updatePropagator();
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
        this.parent._updatePropagator();
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
            this._updatePropagator();
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
            this.parent._updatePropagator();
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
            .map(child => child.subtreeToString(depth + 1))
            .join("");
        return (
            " ".repeat(depth * 2) +
            "* " +
            /^class ([A-Za-z0-9_]+)/.exec("" + this.constructor)?.[1] +
            "\n" +
            childTree
        );
    }

    /**
     * The global object for expressions (in formula and filter transforms).
     * Nodes in the hierarchy may extend the object using Object.create to
     * introduce variables that are visible downstream the flow.
     *
     * @returns {Record<string, any>}
     */
    getGlobalObject() {
        return this.parent
            ? this.parent.getGlobalObject()
            : ROOT_CONTEXT_OBJECT;
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
     * @param {FlowBatch} flowBatch
     */
    beginBatch(flowBatch) {
        for (const child of this.children) {
            child.beginBatch(flowBatch);
        }
    }

    /**
     *
     * @param {any} datum
     */
    _propagate(datum) {
        // Implementation is set dynamically in add/removeChild
    }
}

/**
 * @param {FlowBatch} flowBatch
 * @returns {flowBatch is import("./flowBatch").FileBatch}
 */
export function isFileBatch(flowBatch) {
    return flowBatch.type == "file";
}

/**
 * @param {FlowBatch} flowBatch
 * @returns {flowBatch is import("./flowBatch").FacetBatch}
 */
export function isFacetBatch(flowBatch) {
    return flowBatch.type == "facet";
}
