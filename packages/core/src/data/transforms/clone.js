import { createCachedCloner } from "../../utils/cloner.js";
import { BEHAVIOR_CLONES, isFileBatch } from "../flowNode.js";
import Transform from "./transform.js";

/**
 * Clones the data objects that pass through.
 */
export default class CloneTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /** @type {(datum: import("../flowNode.js").Datum) => import("../flowNode.js").Datum} */
    #clone = createCachedCloner();

    constructor() {
        super({ type: "clone" });

        /** @param {import("../flowNode.js").Datum} datum */
        const setupCloner = (datum) => {
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
                this.#clone = createCachedCloner();
                this.handle = setupCloner;
            }
            super.beginBatch(flowBatch);
        };
    }
}
