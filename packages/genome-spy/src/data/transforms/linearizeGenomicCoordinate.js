import { field } from "../../utils/field";
import FlowNode, { BEHAVIOR_MODIFIES } from "../flowNode";

/**
 * @typedef {import("../../spec/transform").LinearizeGenomicCoordinateParams} LinearizeGenomicCoordinateParams
 * @typedef {import("../../view/view").default} View
 */
export default class LinearizeGenomicCoordinate extends FlowNode {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {LinearizeGenomicCoordinateParams} params
     * @param {View} view
     */
    constructor(params, view) {
        super();

        const channel = params.channel ?? "x";

        if (!["x", "y"].includes(channel)) {
            throw new Error("Invalid channel: " + channel);
        }

        const scale = view.getScaleResolution(channel).getScale();

        /** @type {import("../../genome/chromMapper").default} */
        let chromMapper;

        if ("chromMapper" in scale) {
            chromMapper = scale.chromMapper();
        } else {
            throw new Error(
                "LinearizeGenomicCoordinate transform requires a locus scale!"
            );
        }

        const chromAccessor = field(params.chrom);
        const posAccessor = field(params.pos);
        const as = params.as;

        /** @param {Record<string, any>} datum */
        this.handle = datum => {
            datum[as] = chromMapper.toContinuous(
                chromAccessor(datum),
                posAccessor(datum)
            );
            this._propagate(datum);
        };
    }
}
