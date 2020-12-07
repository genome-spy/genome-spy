import FilterTransform from "./filter";
import FlattenCompressedExonsTransform from "./flattenCompressedExons";
import FormulaTransform from "./formula";
import RegexFoldTransform from "./regexFold";

/**
 * TODO: Typecasting
 * @type {Record<string, function(object):import("../flowNode").default>}
 */
const transforms = {
    filter: p => new FilterTransform(p),
    flattenCompressedExons: p => new FlattenCompressedExonsTransform(p),
    formula: p => new FormulaTransform(p),
    regexFold: p => new RegexFoldTransform(p)
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
