// eslint-disable-next-line no-unused-vars
import View from "./view.js";

import UnitView from "./unitView.js";
import LayerView from "./layerView.js";
import ConcatView from "./concatView.js";
import { isArray, isObject, isString } from "vega-util";
import { loadExternalViewSpec } from "./viewUtils.js";
import ContainerView from "./containerView";
import ViewError from "../utils/viewError.js";

export const VIEW_ROOT_NAME = "viewRoot";

/**
 * @typedef {object} ViewFactoryOptions
 * @property {boolean} [allowImport]
 * @property {boolean} [wrapRoot]
 */

/**
 *
 */
export class ViewFactory {
    /**
     * @typedef {import("../types/viewContext").default} ViewContext
     * @typedef {import("../spec/view").UnitSpec} UnitSpec
     * @typedef {import("../spec/view").ViewSpec} ViewSpec
     * @typedef {import("../spec/view").LayerSpec} LayerSpec
     * @typedef {import("../spec/view").VConcatSpec} VConcatSpec
     * @typedef {import("../spec/view").ConcatSpec} ConcatSpec
     * @typedef {import("../spec/sampleView").SampleSpec} SampleSpec
     *
     * @typedef {(spec: ViewSpec) => boolean} SpecGuard
     * @typedef {(spec: ViewSpec, context: ViewContext, layoutParent?: import("./containerView").default, dataParent?: import("./view").default, defaultName?: string) => View} Factory
     */

    /** @type {Map<SpecGuard, Factory>} */
    #types = new Map();

    /**
     * @param {ViewFactoryOptions} [options]
     */
    constructor(options = {}) {
        /** @type {Required<ViewFactoryOptions>} */
        this.options = {
            allowImport: true,
            wrapRoot: true,
            ...options,
        };

        const makeDefaultFactory =
            (/** @type {typeof View} */ ViewClass) =>
            /** @type {Factory} */
            (spec, context, layoutParent, dataParent, defaultName) =>
                /** @type {View} */ (
                    new ViewClass(
                        spec,
                        context,
                        layoutParent,
                        dataParent,
                        spec.name ?? defaultName
                    )
                );

        this.addViewType(isLayerSpec, makeDefaultFactory(LayerView));
        this.addViewType(isUnitSpec, makeDefaultFactory(UnitView));
        this.addViewType(isVConcatSpec, makeDefaultFactory(ConcatView));
        this.addViewType(isHConcatSpec, makeDefaultFactory(ConcatView));
        this.addViewType(isConcatSpec, makeDefaultFactory(ConcatView));
        //this.addViewType(isFacetSpec, makeDefaultFactory(FacetView));

        this.addViewType(isSampleSpec, () => {
            throw new Error(
                "SampleView is not supported by the @genome-spy/core package. Use @genome-spy/app instead!"
            );
        });
    }

    /**
     * @param {SpecGuard} specGuard
     * @param {Factory} factory
     */
    addViewType(specGuard, factory) {
        this.#types.set(specGuard, factory);
    }

    /**
     * @param {ViewSpec} spec
     * @param {ViewContext} context
     * @param {import("./containerView").default} [layoutParent]
     * @param {import("./view").default} [dataParent]
     * @param {string} [defaultName]
     */
    createView(spec, context, layoutParent, dataParent, defaultName) {
        for (const [guard, factory] of this.#types) {
            if (guard(spec)) {
                return factory(
                    spec,
                    context,
                    layoutParent,
                    dataParent,
                    defaultName
                );
            }
        }

        throw new Error(
            "Invalid spec, cannot figure out the view type from the properties: " +
                JSON.stringify([...Object.keys(spec)])
        );
    }

    /**
     *
     * @param {ViewSpec} spec
     * @returns {spec is ViewSpec}
     */
    isViewSpec(spec) {
        const matches = [...this.#types.keys()].filter((guard) => guard(spec));

        if (matches.length > 1) {
            throw new Error("Ambiguous spec. Cannot create a view!");
        }

        return matches.length == 1;
    }

    /**
     * Creates a view from a spec, or imports it from an external source.
     * Also initializes child views.
     *
     * @param {ViewSpec | import("../spec/view").ImportSpec} spec
     * @param {ViewContext} context
     * @param {import("./containerView").default} [layoutParent]
     * @param {import("./view").default} [dataParent]
     * @param {string} [defaultName]
     * @param {(spec: ViewSpec) => void} [validator]
     */
    async createOrImportView(
        spec,
        context,
        layoutParent,
        dataParent,
        defaultName,
        validator
    ) {
        /** @type {ViewSpec} */
        let viewSpec;

        if (isImportSpec(spec)) {
            if (this.options.allowImport) {
                viewSpec = await loadExternalViewSpec(
                    spec,
                    dataParent.getBaseUrl(),
                    context
                );

                if (validator) {
                    validator(viewSpec);
                }
            } else {
                throw new ViewError(
                    "Importing views is not allowed!",
                    layoutParent
                );
            }
        } else {
            viewSpec = spec;
        }

        // Wrap a unit spec at root into a grid view to get axes, etc.
        if (
            !dataParent &&
            this.options.wrapRoot &&
            (isUnitSpec(viewSpec) || isLayerSpec(viewSpec)) &&
            defaultName === VIEW_ROOT_NAME
        ) {
            viewSpec = {
                name: "implicitRoot",
                vconcat: [viewSpec],
            };
        }

        const view = this.createView(
            viewSpec,
            context,
            layoutParent,
            dataParent,
            defaultName
        );

        if (view instanceof ContainerView) {
            await view.initializeChildren();
        }

        return view;
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
 * @returns {spec is import("../spec/view").ImportSpec}
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

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is SampleSpec}
 */
export function isSampleSpec(spec) {
    return (
        "samples" in spec &&
        isObject(spec.samples) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}
