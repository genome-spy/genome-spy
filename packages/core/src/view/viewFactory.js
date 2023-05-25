// eslint-disable-next-line no-unused-vars
import View from "./view";

import UnitView from "./unitView";
import ImportView from "./importView";
import LayerView from "./layerView";
import ConcatView from "./concatView";
import { isArray, isObject, isString } from "vega-util";

/**
 * @typedef {import("./viewContext").default} ViewContext
 * @typedef {import("../spec/view").UnitSpec} UnitSpec
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("../spec/view").ImportSpec} ImportSpec
 * @typedef {import("../spec/view").VConcatSpec} VConcatSpec
 * @typedef {import("../spec/view").HConcatSpec} HConcatSpec
 * @typedef {import("../spec/view").ConcatSpec} ConcatSpec
 * @typedef {VConcatSpec | HConcatSpec | ConcatSpec} AnyConcatSpec
 *
 * @typedef {(spec: ViewSpec) => boolean} specGuard
 * @typedef {(spec: ViewSpec, context: ViewContext, parent?: import("./containerView").default, defaultName?: string) => View} factory
 */

export class ViewFactory {
    constructor() {
        /** @type {{specGuard: specGuard, factory: factory}[]} */
        this.types = [];

        const makeDefaultFactory =
            (/** @type {typeof View} */ ViewClass) =>
            /** @type {factory} */
            (spec, context, parent, defaultName) =>
                /** @type {View} */ (
                    new ViewClass(
                        spec,
                        context,
                        parent,
                        spec.name ?? defaultName
                    )
                );

        // @ts-expect-error TODO: Fix typing
        this.addViewType(isImportSpec, makeDefaultFactory(ImportView));
        this.addViewType(isLayerSpec, makeDefaultFactory(LayerView));
        this.addViewType(isUnitSpec, makeDefaultFactory(UnitView));
        this.addViewType(isVConcatSpec, makeDefaultFactory(ConcatView));
        this.addViewType(isHConcatSpec, makeDefaultFactory(ConcatView));
        this.addViewType(isConcatSpec, makeDefaultFactory(ConcatView));
        //this.addViewType(isFacetSpec, makeDefaultFactory(FacetView));
    }

    /**
     * @param {specGuard} specGuard
     * @param {factory} factory
     */
    addViewType(specGuard, factory) {
        this.types.push({ specGuard, factory });
    }

    /**
     * @param {ViewSpec} spec
     * @param {ViewContext} context
     * @param {import("./containerView").default} [parent]
     * @param {string} [defaultName]
     */
    createView(spec, context, parent, defaultName) {
        const type = this.types.find((type) => type.specGuard(spec));
        if (type) {
            return type.factory(
                spec,
                context,
                parent,
                defaultName ?? "unnamed"
            );
        } else {
            throw new Error(
                "Invalid spec, cannot figure out the view type from the properties: " +
                    JSON.stringify([...Object.keys(spec)])
            );
        }
    }

    /**
     *
     * @param {ViewSpec} spec
     * @returns {spec is ViewSpec}
     */
    isViewSpec(spec) {
        const matches = this.types.filter((type) => type.specGuard(spec));

        if (matches.length > 1) {
            throw new Error("Ambiguous spec. Cannot create a view!");
        }

        return matches.length == 1;
    }
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is UnitSpec}
 */
export function isUnitSpec(spec) {
    return "mark" in spec && (isString(spec.mark) || isObject(spec.mark));
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is LayerSpec}
 */
export function isLayerSpec(spec) {
    return "layer" in spec && isObject(spec.layer);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is LayerSpec}
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
 * @param {ViewSpec} spec
 * @returns {spec is import("../spec/view").AggregateSamplesSpec}
 */
export function isAggregateSamplesSpec(spec) {
    return (
        spec &&
        (isUnitSpec(spec) || isLayerSpec(spec)) &&
        "aggregateSamples" in spec
    );
}

/**
 *
 * @param {object} spec
 * @returns {spec is ImportSpec}
 */
export function isImportSpec(spec) {
    return "import" in spec;
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is VConcatSpec}
 */
export function isVConcatSpec(spec) {
    return "vconcat" in spec && isArray(spec.vconcat);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is HConcatSpec}
 */
export function isHConcatSpec(spec) {
    return "hconcat" in spec && isArray(spec.hconcat);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is ConcatSpec}
 */
export function isConcatSpec(spec) {
    return "concat" in spec && isArray(spec.concat);
}
