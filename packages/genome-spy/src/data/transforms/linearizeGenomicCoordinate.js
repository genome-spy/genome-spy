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

        const genome = view.getScaleResolution(channel).getGenome();
        if (!genome) {
            throw new Error(
                "LinearizeGenomicCoordinate transform requires a locus scale!"
            );
        }

        const chromAccessor = field(params.chrom);
        const posAccessor = field(params.pos);
        const as = params.as;

        /** @type {any} */
        let lastChrom;
        let chromOffset = 0;

        /** @param {Record<string, any>} datum */
        this.handle = datum => {
            const chrom = chromAccessor(datum);
            if (chrom != lastChrom) {
                chromOffset = genome.cumulativeChromPositions.get(chrom);
                if (chromOffset === undefined) {
                    throw new Error("Unknown chromosome/contig: " + chrom);
                }
            }

            datum[as] = chromOffset + +posAccessor(datum);

            this._propagate(datum);
        };
    }
}
