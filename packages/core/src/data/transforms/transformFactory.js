import Collector from "../collector.js";
import AlignmentMismatchesTransform from "./alignmentMismatches.js";
import CoordinateLookupTransform from "./coordinateLookup.js";
import CoverageTransform from "./coverage.js";
import FilterScoredLabelsTransform from "./filterScoredLabels.js";
import FilterTransform from "./filter.js";
import FlattenTransform from "./flatten.js";
import FlattenCompressedExonsTransform from "./flattenCompressedExons.js";
import FlattenCigarTransform from "./flattenCigar.js";
import FlattenDelimitedTransform from "./flattenDelimited.js";
import FormulaTransform from "./formula.js";
import LinearizeGenomicCoordinate from "./linearizeGenomicCoordinate.js";
import LookupTransform from "./lookup.js";
import MeasureTextTransform from "./measureText.js";
import PackLegendLabelsTransform from "./packLegendLabels.js";
import PileupTransform from "./pileup.js";
import ProjectTransform from "./project.js";
import RegexExtractTransform from "./regexExtract.js";
import RegexFoldTransform from "./regexFold.js";
import SampleTransform from "./sample.js";
import StackTransform from "./stack.js";
import FlattenSequenceTransform from "./flattenSequence.js";
import AggregateTransform from "./aggregate.js";
import IdentifierTransform from "./identifier.js";
import TruncateTextTransform from "./truncateText.js";
import WindowTransform from "./window.js";

/**
 * TODO: Make this dynamic
 *
 * @type {Record<string, new (params: any, view?: import("../../view/view.js").default) => import("../flowNode.js").default>}
 */
export const transforms = {
    aggregate: AggregateTransform,
    alignmentMismatches: AlignmentMismatchesTransform,
    collect: Collector,
    coverage: CoverageTransform,
    filterScoredLabels: FilterScoredLabelsTransform,
    filter: FilterTransform,
    flatten: FlattenTransform,
    flattenCigar: FlattenCigarTransform,
    flattenCompressedExons: FlattenCompressedExonsTransform,
    flattenDelimited: FlattenDelimitedTransform,
    flattenSequence: FlattenSequenceTransform,
    formula: FormulaTransform,
    identifier: IdentifierTransform,
    linearizeGenomicCoordinate: LinearizeGenomicCoordinate,
    measureText: MeasureTextTransform,
    packLegendLabels: PackLegendLabelsTransform,
    pileup: PileupTransform,
    project: ProjectTransform,
    regexExtract: RegexExtractTransform,
    regexFold: RegexFoldTransform,
    sample: SampleTransform,
    truncateText: TruncateTextTransform,
    window: WindowTransform,
    stack: StackTransform,
};

/**
 * @param {import("../../spec/transform.js").TransformParamsBase} params
 * @param {import("../../view/view.js").default} [view]
 * @param {{ collector: import("../collector.js").default, source: import("../sources/dataSource.js").default}} [foreignInput]
 */
export default function createTransform(params, view, foreignInput) {
    if (params.type == "lookup") {
        if (!foreignInput) {
            throw new Error("Lookup transform requires a foreign collector.");
        }
        return new LookupTransform(
            /** @type {import("../../spec/transform.js").LookupParams} */ (
                params
            ),
            foreignInput.collector
        );
    } else if (params.type == "coordinateLookup") {
        if (!foreignInput || !view) {
            throw new Error(
                "Coordinate lookup requires a view and a foreign data source."
            );
        }
        return new CoordinateLookupTransform(
            /** @type {import("../../spec/transform.js").CoordinateLookupParams} */ (
                params
            ),
            foreignInput.collector,
            foreignInput.source,
            view
        );
    }

    const Transform = transforms[params.type];
    if (Transform) {
        return new Transform(params, view);
    } else {
        throw new Error("Unknown transform: " + params.type);
    }
}
