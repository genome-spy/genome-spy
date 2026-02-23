import { isArray, isObject, isString } from "vega-util";

/**
 *
 * @param {import("../spec/view.js").ViewSpec} spec
 * @returns {spec is import("../spec/view.js").UnitSpec}
 */
export function isUnitSpec(spec) {
    return "mark" in spec && (isString(spec.mark) || isObject(spec.mark));
}

/**
 *
 * @param {import("../spec/view.js").ViewSpec} spec
 * @returns {spec is import("../spec/view.js").LayerSpec}
 */
export function isLayerSpec(spec) {
    return "layer" in spec && isObject(spec.layer);
}

/**
 *
 * @param {import("../spec/view.js").ViewSpec} spec
 * @returns {spec is import("../spec/view.js").FacetSpec}
 */
export function isFacetSpec(spec) {
    return (
        "facet" in spec &&
        isObject(spec.facet) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}

/**
 *
 * @param {object} spec
 * @returns {spec is import("../spec/view.js").ImportSpec}
 */
export function isImportSpec(spec) {
    return "import" in spec;
}

/**
 *
 * @param {import("../spec/view.js").ViewSpec} spec
 * @returns {spec is import("../spec/view.js").VConcatSpec}
 */
export function isVConcatSpec(spec) {
    return "vconcat" in spec && isArray(spec.vconcat);
}

/**
 *
 * @param {import("../spec/view.js").ViewSpec} spec
 * @returns {spec is import("../spec/view.js").HConcatSpec}
 */
export function isHConcatSpec(spec) {
    return "hconcat" in spec && isArray(spec.hconcat);
}

/**
 *
 * @param {import("../spec/view.js").ViewSpec} spec
 * @returns {spec is import("../spec/view.js").ConcatSpec}
 */
export function isConcatSpec(spec) {
    return "concat" in spec && isArray(spec.concat);
}
