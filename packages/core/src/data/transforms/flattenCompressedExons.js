import { field } from "../../utils/field";
import numberExtractor from "../../utils/numberExtractor";
import FlowNode, { BEHAVIOR_CLONES } from "../flowNode";

/**
 * Flattens "run-length encoded" exons. The transforms inputs the start
 * coordinate of the gene body and a comma-delimited string of alternating
 * intron and exon lengths. A new datum is created for each exon.
 */
export default class FlattenCompressedExonsTransform extends FlowNode {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     *
     * @param {import("../../spec/transform").FlattenCompressedExonsParams} params
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
