import { asArray } from "../../utils/arrayUtils";
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
        const posAccessors = asArray(params.pos).map(pos => field(pos));
        const as = asArray(params.as);

        if (posAccessors.length != as.length) {
            throw new Error(
                'The number of "pos" and "as" elements must be equal!'
            );
        }

        /** @type {any} */
        let lastChrom;
        let chromOffset = 0;

        /** @param {string | number} chrom */
        const getChromOffset = chrom => {
            if (chrom !== lastChrom) {
                chromOffset = genome.cumulativeChromPositions.get(chrom);
                if (chromOffset === undefined) {
                    throw new Error("Unknown chromosome/contig: " + chrom);
                }
                lastChrom = chrom;
            }

            return chromOffset;
        };

        /** @param {Record<string, any>} datum */
        this.handle = datum => {
            const offset = getChromOffset(chromAccessor(datum));
            for (let i = 0; i < as.length; i++) {
                datum[as[i]] = offset + +posAccessors[i](datum);
            }

            this._propagate(datum);
        };
    }
}
