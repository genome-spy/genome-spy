import Collector from "../collector";
import CoverageTransform from "./coverage";
import FilterScoredLabelsTransform from "./filterScoredLabels";
import FilterTransform from "./filter";
import FlattenCompressedExonsTransform from "./flattenCompressedExons";
import FlattenDelimitedTransform from "./flattenDelimited";
import FormulaTransform from "./formula";
import LinearizeGenomicCoordinate from "./linearizeGenomicCoordinate";
import MeasureTextTransform from "./measureText";
import PileupTransform from "./pileup";
import ProjectTransform from "./project";
import RegexExtractTransform from "./regexExtract";
import RegexFoldTransform from "./regexFold";
import SampleTransform from "./sample";
import StackTransform from "./stack";
import FlattenSequenceTransform from "./flattenSequence";
import AggregateTransform from "./aggregate";
import IdentifierTransform from "./identifier";

/**
 * TODO: Make this dynamic
 *
 * @type {Record<string, new (params: any, view?: import("../../view/view").default) => import("../flowNode").default>}
 */
export const transforms = {
    aggregate: AggregateTransform,
    collect: Collector,
    coverage: CoverageTransform,
    filterScoredLabels: FilterScoredLabelsTransform,
    filter: FilterTransform,
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
 * @param {import("../../spec/transform").TransformParamsBase} params
 * @param {import("../../view/view").default} [view]
 */
export default function createTransform(params, view) {
    const Transform = transforms[params.type];
    if (Transform) {
        return new Transform(params, view);
    } else {
        throw new Error("Unknown transform: " + params.type);
    }
}
