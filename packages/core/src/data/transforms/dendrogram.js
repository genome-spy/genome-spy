import { BEHAVIOR_CLONES } from "../flowNode.js";
import {
    createFileBatchAccessor,
    createFileBatchPropagator,
} from "../fileBatchUtils.js";
import { UNIQUE_ID_KEY } from "./identifier.js";
import Transform from "./transform.js";
import { validateOutputSources } from "../flowOutput.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";

/** @typedef {import("../flowNode.js").Datum} Datum */
/**
 * @typedef {object} LayoutNode
 * @prop {string | number} key
 * @prop {Datum} datum
 * @prop {LayoutNode | null} parent
 * @prop {LayoutNode[]} children
 * @prop {number} height
 * @prop {number} position
 * @prop {number} firstLeaf
 * @prop {number} lastLeaf
 * @prop {number} leafCount
 */

const OUTPUT_FIELDS = [
    "sourceId",
    "targetId",
    "sourceHeight",
    "targetHeight",
    "sourceIndex",
    "targetIndex",
    "sourceOffset",
    "targetOffset",
];

/** Lays out a precomputed tree in row coordinates and emits parent-child edges. */
export default class DendrogramTransform extends Transform {
    /** @type {Datum[]} */
    #buffer = [];

    /** @type {import("../fileBatchUtils.js").FileBatchStart[]} */
    #fileBatchStarts = [];

    /** @type {import("../../spec/channel.js").Scalar[]} */
    #categories = [];

    #treeCount = 0;

    /** @type {() => unknown} */
    #leafOrder = () => undefined;

    get behavior() {
        return BEHAVIOR_CLONES;
    }

    get createsNewIdentity() {
        return true;
    }

    /**
     * @param {import("../../spec/transform.js").DendrogramParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [provider]
     */
    constructor(params, provider) {
        super(params, provider);
        this.keyAccessor = this.createFieldAccessor(params, "key");
        this.parentAccessor = this.createFieldAccessor(params, "parentKey");
        this.heightAccessor = this.createFieldAccessor(params, "height");
        this.params = params;
        this.categorical = params.leaf !== undefined;
        if (this.categorical) {
            if (
                params.leafIndex !== undefined ||
                (params.siblingOrder !== undefined) ===
                    (params.leafOrder !== undefined)
            ) {
                throw new Error(
                    "Categorical dendrograms require exactly one of siblingOrder and leafOrder, without leafIndex."
                );
            }
        } else if (
            params.domainParam !== undefined ||
            params.siblingOrder !== undefined ||
            params.leafOrder !== undefined
        ) {
            throw new Error(
                "Numeric dendrograms require leafIndex without categorical ordering or publication."
            );
        }
        this.leafAccessor = this.createFieldAccessor(
            params,
            this.categorical ? "leaf" : "leafIndex"
        );
        this.siblingOrderAccessor =
            params.siblingOrder === undefined
                ? undefined
                : this.createFieldAccessor(params, "siblingOrder");
        if (Array.isArray(params.leafOrder))
            this.#leafOrder = () => params.leafOrder;
        if (params.domainParam !== undefined) {
            this.output = this.paramRuntime.resolveOutput(params.domainParam);
            if (this.output.producer)
                throw new Error("Duplicate dendrogram output producer.");
            this.output.producer = this;
        }
        this.as =
            params.as ??
            OUTPUT_FIELDS.map((name, i) =>
                this.categorical && (i === 4 || i === 5)
                    ? name.replace("Index", "Value")
                    : name
            );
        if (
            this.as.length !== 8 ||
            new Set(this.as).size !== 8 ||
            this.as.some(
                (name) =>
                    typeof name !== "string" || !name || name === UNIQUE_ID_KEY
            )
        ) {
            throw new Error(
                "Dendrogram as must contain eight distinct, nonempty field names, excluding " +
                    UNIQUE_ID_KEY +
                    "."
            );
        }
    }

    initialize() {
        if (this.output) validateOutputSources(this);
        if (isExprRef(this.params.leafOrder)) {
            this.#leafOrder = this.watchSnapshottedExpression(
                this.params.leafOrder
            );
        }
    }

    reset() {
        super.reset();
        this.#treeCount = 0;
        if (this.output) {
            this.output.ready = false;
            this.output.candidate = undefined;
        }
        this.#buffer = [];
        this.#fileBatchStarts = [];
    }

    /** @param {Datum} datum */
    handle(datum) {
        this.#buffer.push(datum);
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} batch */
    beginBatch(batch) {
        if (this.output && batch.type === "facet") {
            throw new Error("Publishing dendrograms do not support facets.");
        }
        if (batch.type === "file") {
            if (!this.inFacet) this.#flush();
            this.#fileBatchStarts.push({ index: this.#buffer.length, batch });
        } else {
            this.#flush();
            super.beginBatch(batch);
        }
    }

    complete() {
        this.#flush();
        super.complete();
        if (this.output && this.#treeCount === 0)
            this.output.candidate = Object.freeze([]);
    }

    #flush() {
        const data = this.#buffer;
        const getBatch = createFileBatchAccessor(data, this.#fileBatchStarts);
        const nodes = this.#layout(data);
        if (this.output && nodes.length && ++this.#treeCount > 1) {
            throw new Error(
                "Publishing dendrograms require one tree per completed flow."
            );
        }
        const anchor = (/** @type {number} */ position) =>
            this.categorical
                ? this.#categories[Math.floor(position)]
                : Math.floor(position);
        const propagate = createFileBatchPropagator(
            (node) => getBatch(node.datum),
            (batch) => super.beginBatch(batch),
            (record) => {
                const node = /** @type {LayoutNode} */ (record);
                const parent = node.parent;
                const edge = { ...node.datum };
                delete edge[UNIQUE_ID_KEY];
                edge[this.as[0]] = parent.key;
                edge[this.as[1]] = node.key;
                edge[this.as[2]] = parent.height;
                edge[this.as[3]] = node.height;
                edge[this.as[4]] = anchor(parent.position);
                edge[this.as[5]] = anchor(node.position);
                edge[this.as[6]] = parent.position % 1;
                edge[this.as[7]] = node.position % 1;
                this._propagate(edge);
            }
        );
        for (const node of nodes) {
            if (node.parent) propagate(node);
        }
        if (this.output && nodes.length)
            this.output.candidate = Object.freeze(this.#categories);
        this.#buffer = [];
        this.#fileBatchStarts = [];
    }

    /** @param {Datum[]} data @returns {LayoutNode[]} */
    #layout(data) {
        this.#categories = [];
        /** @type {Map<string | number, LayoutNode>} */
        const byKey = new Map();
        const nodes = data.map((datum) => {
            const key = this.keyAccessor(datum);
            if (!isKey(key) || byKey.has(key))
                throw new Error(
                    "Invalid or duplicate dendrogram key: " + String(key)
                );
            const height = this.heightAccessor(datum);
            if (
                typeof height !== "number" ||
                !Number.isFinite(height) ||
                height < 0
            )
                throw new Error(
                    "Invalid dendrogram height for node " + String(key)
                );
            /** @type {LayoutNode} */
            const node = {
                key,
                datum,
                parent: null,
                children: [],
                height,
                position: 0,
                firstLeaf: 0,
                lastLeaf: 0,
                leafCount: 0,
            };
            byKey.set(key, node);
            return node;
        });
        if (!nodes.length) return nodes;

        const roots = [];
        for (const node of nodes) {
            const parentKey = this.parentAccessor(node.datum);
            if (parentKey === null) {
                roots.push(node);
            } else {
                const parent = byKey.get(parentKey);
                if (!isKey(parentKey) || !parent)
                    throw new Error(
                        "Missing dendrogram parent for node " + String(node.key)
                    );
                node.parent = parent;
                parent.children.push(node);
            }
        }
        if (roots.length !== 1)
            throw new Error(
                "Dendrogram requires exactly one root; found " + roots.length
            );

        if (this.siblingOrderAccessor) {
            for (const node of nodes) {
                const ranks = new Set();
                for (const child of node.children) {
                    const rank = this.siblingOrderAccessor(child.datum);
                    if (
                        typeof rank !== "number" ||
                        !Number.isFinite(rank) ||
                        ranks.has(rank)
                    ) {
                        throw new Error(
                            "Invalid or duplicate dendrogram sibling order at node " +
                                String(child.key)
                        );
                    }
                    ranks.add(rank);
                }
                node.children.sort(
                    (a, b) =>
                        this.siblingOrderAccessor(a.datum) -
                        this.siblingOrderAccessor(b.datum)
                );
            }
        }

        const order = [];
        const pending = [roots[0]];
        // Unique nodes with one parent cannot form a cycle reachable from the root.
        while (pending.length) {
            const node = pending.pop();
            order.push(node);
            for (let i = node.children.length - 1; i >= 0; i--)
                pending.push(node.children[i]);
        }
        if (order.length !== nodes.length) {
            const visited = new Set(order);
            const unreachable = nodes.find((node) => !visited.has(node));
            throw new Error(
                "Dendrogram cycle or disconnected node: " +
                    String(unreachable.key)
            );
        }

        const leaves = order.filter((node) => !node.children.length);
        if (this.categorical) this.#assignCategories(leaves);
        for (const node of leaves) {
            const index = this.categorical
                ? node.position
                : this.leafAccessor(node.datum);
            if (!Number.isSafeInteger(index) || index < 0 || index >= 2 ** 44)
                throw new Error(
                    "Invalid dendrogram leaf index for node " + String(node.key)
                );
            node.position = index;
        }
        leaves.sort((a, b) => a.position - b.position);
        leaves.forEach((node, rank) => {
            if (rank > 0 && node.position === leaves[rank - 1].position)
                throw new Error(
                    "Duplicate dendrogram leaf index: " + node.position
                );
            node.firstLeaf = node.lastLeaf = rank;
            node.leafCount = 1;
        });

        // Bottom-up child midpoints follow the ComplexHeatmap layout convention.
        // https://github.com/jokergoo/ComplexHeatmap/blob/master/R/grid.dendrogram.R
        for (const node of order.reverse()) {
            if (!node.children.length) continue;
            let minimum = Infinity;
            let maximum = -Infinity;
            node.firstLeaf = Infinity;
            node.lastLeaf = -Infinity;
            for (const child of node.children) {
                minimum = Math.min(minimum, child.position);
                maximum = Math.max(maximum, child.position);
                node.firstLeaf = Math.min(node.firstLeaf, child.firstLeaf);
                node.lastLeaf = Math.max(node.lastLeaf, child.lastLeaf);
                node.leafCount += child.leafCount;
            }
            if (node.lastLeaf - node.firstLeaf + 1 !== node.leafCount)
                throw new Error(
                    "Incompatible dendrogram leaf order at node " +
                        String(node.key)
                );
            node.position = (minimum + maximum) / 2;
        }
        return nodes;
    }

    /** @param {LayoutNode[]} leaves */
    #assignCategories(leaves) {
        const values = leaves.map((node) => this.leafAccessor(node.datum));
        validateCategories(values);
        const domain = this.siblingOrderAccessor ? values : this.#leafOrder();
        validateCategories(domain);
        this.#categories = Array.from(domain);
        const ranks = new Map(
            this.#categories.map((value, rank) => [value, rank])
        );
        for (let i = 0; i < leaves.length; i++) {
            const rank = ranks.get(values[i]);
            if (rank === undefined)
                throw new Error(
                    "Dendrogram leafOrder is missing category " +
                        String(values[i])
                );
            leaves[i].position = rank;
        }
    }
}

/** @param {unknown} values @returns {asserts values is import("../../spec/channel.js").Scalar[]} */
function validateCategories(values) {
    if (
        !Array.isArray(values) ||
        values.some(
            (value) =>
                !(
                    typeof value === "string" ||
                    typeof value === "boolean" ||
                    (typeof value === "number" && Number.isFinite(value))
                )
        ) ||
        new Set(values).size !== values.length
    ) {
        throw new Error(
            "Dendrogram categories must be unique strings, finite numbers, or booleans."
        );
    }
}

/** @param {unknown} value @returns {value is string | number} */
function isKey(value) {
    return (
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}
