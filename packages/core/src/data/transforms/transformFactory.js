import Collector from "../collector.js";
import CoverageTransform from "./coverage.js";
import FilterScoredLabelsTransform from "./filterScoredLabels.js";
import FilterTransform from "./filter.js";
import FlattenTransform from "./flatten.js";
import FlattenCompressedExonsTransform from "./flattenCompressedExons.js";
import FlattenDelimitedTransform from "./flattenDelimited.js";
import FormulaTransform from "./formula.js";
import LinearizeGenomicCoordinate from "./linearizeGenomicCoordinate.js";
import MeasureTextTransform from "./measureText.js";
import PileupTransform from "./pileup.js";
import ProjectTransform from "./project.js";
import RegexExtractTransform from "./regexExtract.js";
import RegexFoldTransform from "./regexFold.js";
import SampleTransform from "./sample.js";
import StackTransform from "./stack.js";
import FlattenSequenceTransform from "./flattenSequence.js";
import AggregateTransform from "./aggregate.js";
import IdentifierTransform from "./identifier.js";

/**
 * TODO: Make this dynamic
 *
 * @type {Record<string, new (params: any, view?: import("../../view/view.js").default) => import("../flowNode.js").default>}
 */
export const transforms = {
    aggregate: AggregateTransform,
    collect: Collector,
    coverage: CoverageTransform,
    filterScoredLabels: FilterScoredLabelsTransform,
    filter: FilterTransform,
    flatten: FlattenTransform,
    flattenCompressedExons: FlattenCompressedExonsTransform,
    flattenDelimited: FlattenDelimitedTransform,
    flattenSequence: FlattenSequenceTransform,
    formula: FormulaTransform,
    identifier: IdentifierTransform,
    linearizeGenomicCoordinate: LinearizeGenomicCoordinate,
    measureText: MeasureTextTransform,
    pileup: PileupTransform,
    project: ProjectTransform,
    regexExtract: RegexExtractTransform,
    regexFold: RegexFoldTransform,
    sample: SampleTransform,
    stack: StackTransform,
};

/**
 * @param {import("../../spec/transform.js").TransformParamsBase} params
 * @param {import("../../view/view.js").default} [view]
 */
export default function createTransform(params, view) {
    const Transform = transforms[params.type];
    if (Transform) {
        return new Transform(params, view);
    } else {
        throw new Error("Unknown transform: " + params.type);
    }
}
