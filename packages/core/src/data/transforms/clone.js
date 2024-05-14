import { shallowArrayEquals } from "../../utils/arrayUtils.js";
import createCloner, { getAllProperties } from "../../utils/cloner.js";
import FlowNode, { BEHAVIOR_CLONES, isFileBatch } from "../flowNode.js";

/**
 * Clones the data objects that pass through.
 */
export default class CloneTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /** @type {string[]} */
    #lastBatchFields;

    /** @type {(datum: import("../flowNode.js").Datum) => import("../flowNode.js").Datum} */
    #clone = (datum) => datum;

    constructor() {
        super();

        /** @param {import("../flowNode.js").Datum} datum */
        const setupCloner = (datum) => {
            // Create a new cloner if the fields have changed
            const fields = getAllProperties(datum);
            if (
                !this.#lastBatchFields ||
                !shallowArrayEquals(fields, this.#lastBatchFields)
            ) {
                this.#lastBatchFields = fields;
                this.#clone = createCloner(datum);
            }

            const clone = this.#clone;
            /** @param {any} datum */
            this.handle = (datum) => this._propagate(clone(datum));

            this.handle(datum);
        };

        this.handle = setupCloner;

        /**
         * Signals that a new batch of data will be propagated.
         *
         * @param {import("../../types/flowBatch.js").FlowBatch} [flowBatch]
         */
        this.beginBatch = (flowBatch) => {
            if (isFileBatch(flowBatch)) {
                this.handle = setupCloner;
            }
            super.beginBatch(flowBatch);
        };
    }
}
