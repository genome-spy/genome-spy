import createCloner from "../../utils/cloner.js";
import FlowNode, { BEHAVIOR_CLONES, isFileBatch } from "../flowNode.js";

/**
 * Clones the data objects that pass through.
 */
export default class CloneTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    constructor() {
        super();

        /** @param {any} datum */
        const setupCloner = (datum) => {
            const clone = createCloner(datum);

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
                // TODO: Only create new cloner if the props change
                this.handle = setupCloner;
            }
            super.beginBatch(flowBatch);
        };
    }
}
