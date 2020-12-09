import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

/**
 * Clones the data objects that pass through.
 */
export default class CloneTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {any} datum
     */
    handle(datum) {
        this._propagate(Object.assign({}, datum));
    }
}
