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
        const posAccessors = asArray(params.pos).map((pos) => field(pos));
        const as = asArray(params.as);

        if (posAccessors.length != as.length) {
            throw new Error(
                'The number of "pos" and "as" elements must be equal!'
            );
        }

        const offsetParam = asArray(params.offset);

        /** @type {number[]} */
        let posOffsets;

        if (offsetParam.length == 0) {
            posOffsets = new Array(posAccessors.length).fill(0);
        } else if (offsetParam.length == 1) {
            posOffsets = new Array(posAccessors.length).fill(offsetParam[0]);
        } else if (offsetParam.length == posAccessors.length) {
            posOffsets = offsetParam;
        } else {
            throw new Error(
                `Invalid "offset" parameter: ${JSON.stringify(params.offset)}!`
            );
        }

        const setter = new Function(
            "datum",
            "chromOffset",
            "posAccessors",
            as
                .map(
                    (a, i) =>
                        `datum[${JSON.stringify(
                            a
                        )}] = chromOffset + +posAccessors[${i}](datum) - ${
                            posOffsets[i]
                        };`
                )
                .join("\n")
        );

        /** @type {any} */
        let lastChrom;
        let chromOffset = 0;

        /** @param {string | number} chrom */
        const getChromOffset = (chrom) => {
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
        this.handle = (datum) => {
            setter(datum, getChromOffset(chromAccessor(datum)), posAccessors);
            this._propagate(datum);
        };
    }
}
