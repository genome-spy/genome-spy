import { createCachedCloner } from "../../utils/cloner.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/**
 * Clones the data objects that pass through.
 */
export default class CloneTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /** @type {ReturnType<typeof createCachedCloner>} */
    #clone = createCachedCloner();

    constructor() {
        super({ type: "clone" });

        /** @param {import("../flowNode.js").Datum} datum */
        this.handle = (datum) => this._propagate(this.#clone(datum));

        /**
         * Signals that a new batch of data will be propagated.
         *
         * @param {import("../../types/flowBatch.js").FlowBatch} flowBatch
         */
        this.beginBatch = (flowBatch) => {
            this.#clone.reset();
            super.beginBatch(flowBatch);
        };
    }
}
