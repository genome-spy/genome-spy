import CoverageTransform from "./coverage";
import FilterTransform from "./filter";
import FlattenCompressedExonsTransform from "./flattenCompressedExons";
import FlattenDelimitedTransform from "./flattenDelimited";
import FormulaTransform from "./formula";
import PileupTransform from "./pileup";
import RegexExtractTransform from "./regexExtract";
import RegexFoldTransform from "./regexFold";
import SampleTransform from "./sample";
import StackTransform from "./stack";

/**
 * TODO: Typecasting
 * @type {Record<string, function(object):import("../flowNode").default>}
 */
const transforms = {
    coverage: p => new CoverageTransform(p),
    filter: p => new FilterTransform(p),
    flattenCompressedExons: p => new FlattenCompressedExonsTransform(p),
    flattenDelimited: p => new FlattenDelimitedTransform(p),
    formula: p => new FormulaTransform(p),
    pileup: p => new PileupTransform(p),
    regexExtract: p => new RegexExtractTransform(p),
    regexFold: p => new RegexFoldTransform(p),
    sample: p => new SampleTransform(p),
    stack: p => new StackTransform(p)
};

/** @param {import("../../spec/transform").TransformConfigBase} params */
export default function createTransform(params) {
    const f = transforms[params.type];
    if (f) {
        return f(params);
    } else {
        throw new Error("Unknown transform: " + params.type);
    }
}
