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

/**
 * @typedef {import("../../view/view").default} View
 * @typedef {import("../flowNode").default} FlowNode
 *
 * @type {Record<string, new (params: any, view?: View) => FlowNode>}
 */
const transforms = {
    collect: Collector,
    coverage: CoverageTransform,
    filterScoredLabels: FilterScoredLabelsTransform,
    filter: FilterTransform,
    flattenCompressedExons: FlattenCompressedExonsTransform,
    flattenDelimited: FlattenDelimitedTransform,
    formula: FormulaTransform,
    linearizeGenomicCoordinate: LinearizeGenomicCoordinate,
    measureText: MeasureTextTransform,
    pileup: PileupTransform,
    project: ProjectTransform,
    regexExtract: RegexExtractTransform,
    regexFold: RegexFoldTransform,
    sample: SampleTransform,
    stack: StackTransform
};

/**
 * @param {import("../../spec/transform").TransformParamsBase} params
 * @param {View} [view]
 */
export default function createTransform(params, view) {
    const Transform = transforms[params.type];
    if (Transform) {
        return new Transform(params, view);
    } else {
        throw new Error("Unknown transform: " + params.type);
    }
}
