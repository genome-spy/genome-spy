import { asArray } from "../../utils/arrayUtils.js";
import { field } from "../../utils/field.js";
import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import Transform from "./transform.js";

export default class LinearizeGenomicCoordinate extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").LinearizeGenomicCoordinateParams} params
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, view) {
        params = {
            channel: "x",
            ...params,
        };

        super(params);
        this.params = params;

        const channel = params.channel;

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
