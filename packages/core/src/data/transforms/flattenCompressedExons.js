import { field } from "../../utils/field.js";
import numberExtractor from "../../utils/numberExtractor.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import Transform from "./transform.js";

/**
 * Flattens "run-length encoded" exons. The transforms inputs the start
 * coordinate of the gene body and a comma-delimited string of alternating
 * intron and exon lengths. A new datum is created for each exon.
 */
export default class FlattenCompressedExonsTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     *
     * @param {import("../../spec/transform.js").FlattenCompressedExonsParams} params
     */
    constructor(params) {
        super();

        const exonsAccessor = field(params.exons ?? "exons");
        const startAccessor = field(params.start ?? "start");
        const [exonStart, exonEnd] = params.as || ["exonStart", "exonEnd"];

        /**
         *
         * @param {any} datum
         */
        this.handle = (datum) => {
            let upper = startAccessor(datum);
            let lower = upper;

            let inExon = true;
            const exons = exonsAccessor(datum);
            for (const token of numberExtractor(exons)) {
                if (inExon) {
                    lower = upper + token;
                } else {
                    upper = lower + token;

                    const newRow = Object.assign({}, datum);
                    newRow[exonStart] = lower;
                    newRow[exonEnd] = upper;

                    this._propagate(newRow);
                }

                inExon = !inExon;
            }
        };
    }
}
