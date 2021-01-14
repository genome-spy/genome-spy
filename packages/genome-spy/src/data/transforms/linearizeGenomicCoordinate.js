import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

/**
 * @typedef {import("../../spec/transform").LinearizeGenomicCoordinateParams} LinearizeGenomicCoordinateParams
 */
export default class LinearizeGenomicCoordinate extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {LinearizeGenomicCoordinateParams} config
     */
    constructor(config) {
        super();

        // WIP
    }
}
