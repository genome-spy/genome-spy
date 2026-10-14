import { BEHAVIOR_CLONES } from "../flowNode.js";
import {
    createFileBatchAccessor,
    createFileBatchPropagator,
} from "../fileBatchUtils.js";
import { UNIQUE_ID_KEY } from "./identifier.js";
import Transform from "./transform.js";

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
        this.leafIndexAccessor = this.createFieldAccessor(params, "leafIndex");
        this.as = params.as ?? OUTPUT_FIELDS;
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

    reset() {
        super.reset();
        this.#buffer = [];
        this.#fileBatchStarts = [];
    }

    /** @param {Datum} datum */
    handle(datum) {
        this.#buffer.push(datum);
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} batch */
    beginBatch(batch) {
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
    }

    #flush() {
        const data = this.#buffer;
        const getBatch = createFileBatchAccessor(data, this.#fileBatchStarts);
        const nodes = this.#layout(data);
        const propagate = createFileBatchPropagator(
            (node) => getBatch(node.datum),
            (batch) => super.beginBatch(batch),
            (record) => {
                const node = /** @type {LayoutNode} */ (record);
                const parent = node.parent;
                const edge = { ...node.datum };
                delete edge[UNIQUE_ID_KEY];
                const values = [
                    parent.key,
                    node.key,
                    parent.height,
                    node.height,
                    Math.floor(parent.position),
                    Math.floor(node.position),
                    parent.position % 1,
                    node.position % 1,
                ];
                this.as.forEach((field, i) => {
                    edge[field] = values[i];
                });
                this._propagate(edge);
            }
        );
        for (const node of nodes) {
            if (node.parent) propagate(node);
        }
        this.#buffer = [];
        this.#fileBatchStarts = [];
    }

    /** @param {Datum[]} data @returns {LayoutNode[]} */
    #layout(data) {
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

        const order = [];
        const pending = [roots[0]];
        const visited = new Set();
        while (pending.length) {
            const node = pending.pop();
            if (visited.has(node))
                throw new Error("Dendrogram cycle at node " + String(node.key));
            visited.add(node);
            order.push(node);
            for (const child of node.children) pending.push(child);
        }
        if (order.length !== nodes.length) {
            const unreachable = nodes.find((node) => !visited.has(node));
            throw new Error(
                "Dendrogram cycle or disconnected node: " +
                    String(unreachable.key)
            );
        }

        const leaves = nodes.filter((node) => !node.children.length);
        for (const node of leaves) {
            const index = this.leafIndexAccessor(node.datum);
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
}

/** @param {unknown} value @returns {value is string | number} */
function isKey(value) {
    return (
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}
