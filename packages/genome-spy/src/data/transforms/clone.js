import createCloner from "../../utils/cloner";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

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
        const setupCloner = datum => {
            const clone = createCloner(datum);

            /** @param {any} datum */
            this.handle = datum => this._propagate(clone(datum));

            this.handle(datum);
        };

        this.handle = setupCloner;

        /**
         * Signals that a new batch of data will be propagated.
         *
         * @param {import("../flowNode").BatchMetadata} [metadata]
         */
        this.beginBatch = metadata => {
            super.beginBatch(metadata);
            // TODO: Only create new cloner if the props change
            this.handle = setupCloner;
        };
    }
}
