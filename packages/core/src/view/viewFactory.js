// eslint-disable-next-line no-unused-vars
import View from "./view.js";

import UnitView from "./unitView.js";
import LayerView from "./layerView.js";
import ConcatView from "./concatView.js";
import { isArray, isObject, isString } from "vega-util";
import { loadExternalViewSpec } from "./viewUtils.js";
import ContainerView from "./containerView.js";
import ViewError from "./viewError.js";
import { isSelectionParameter } from "../paramRuntime/paramUtils.js";
import { asSelectionConfig } from "../selection/selection.js";
import {
    markViewAsNonAddressable,
    registerImportInstance,
} from "./viewSelectors.js";

export const VIEW_ROOT_NAME = "viewRoot";

/**
 * @typedef {object} ViewFactoryOptions
 * @property {boolean} [allowImport] allows imports from urls
 * @property {boolean} [wrapRoot]
 */

/**
 *
 */
export class ViewFactory {
    /**
     * @typedef {import("../types/viewContext.js").default} ViewContext
     * @typedef {import("../spec/view.js").UnitSpec} UnitSpec
     * @typedef {import("../spec/view.js").ViewSpec} ViewSpec
     * @typedef {import("../spec/view.js").LayerSpec} LayerSpec
     * @typedef {import("../spec/view.js").VConcatSpec} VConcatSpec
     * @typedef {import("../spec/view.js").ConcatSpec} ConcatSpec
     *
     * @typedef {(spec: ViewSpec) => boolean} SpecGuard
     * @typedef {(spec: ViewSpec, context: ViewContext, layoutParent?: import("./containerView.js").default, dataParent?: import("./view.js").default, defaultName?: string) => View} Factory
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
                        defaultName
                    )
                );

        this.addViewType(isLayerSpec, makeDefaultFactory(LayerView));
        this.addViewType(isUnitSpec, makeDefaultFactory(UnitView));
        this.addViewType(isVConcatSpec, makeDefaultFactory(ConcatView));
        this.addViewType(isHConcatSpec, makeDefaultFactory(ConcatView));
        this.addViewType(isConcatSpec, makeDefaultFactory(ConcatView));
        //this.addViewType(isFacetSpec, makeDefaultFactory(FacetView));
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
     * @param {import("./containerView.js").default} [layoutParent]
     * @param {import("./view.js").default} [dataParent]
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

        if (isSampleSpec(spec)) {
            throw new Error(
                "SampleView is not supported by the @genome-spy/core package. Use @genome-spy/app instead!"
            );
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
     * @param {ViewSpec | import("../spec/view.js").ImportSpec} spec
     * @param {ViewContext} context
     * @param {import("./containerView.js").default} [layoutParent]
     * @param {import("./view.js").default} [dataParent]
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
        const importScopeName = isImportSpec(spec)
            ? (spec.name ?? null)
            : undefined;

        if (isImportSpec(spec)) {
            /** @type {ViewSpec} */
            let importedSpec;

            if ("url" in spec.import) {
                if (this.options.allowImport) {
                    importedSpec = await loadExternalViewSpec(
                        spec,
                        dataParent.getBaseUrl(),
                        context
                    );
                } else {
                    throw new ViewError(
                        "Importing views is not allowed!",
                        layoutParent
                    );
                }
            } else if ("template" in spec.import) {
                importedSpec = findTemplate(spec.import.template, dataParent);
            } else {
                throw new Error("Invalid import: " + JSON.stringify(spec));
            }

            validator?.(importedSpec);

            applyParamsToImportedSpec(importedSpec, spec);

            viewSpec = importedSpec;
        } else {
            viewSpec = spec;
        }

        // A view with an interval selection always needs a parent.
        const hasIntervalSelection = (/** @type {ViewSpec} */ spec) =>
            spec?.params?.some(
                (param) =>
                    isSelectionParameter(param) &&
                    asSelectionConfig(param.select).type == "interval"
            );

        // Wrap a unit spec at root into a grid view to get axes, etc.
        let isImplicitRoot = false;
        if (
            !dataParent &&
            this.options.wrapRoot &&
            (isUnitSpec(viewSpec) ||
                isLayerSpec(viewSpec) ||
                hasIntervalSelection(viewSpec)) &&
            defaultName === VIEW_ROOT_NAME
        ) {
            viewSpec = {
                name: "implicitRoot",
                vconcat: [viewSpec],
            };
            isImplicitRoot = true;
        }

        const view = this.createView(
            viewSpec,
            context,
            layoutParent,
            dataParent,
            defaultName
        );

        if (importScopeName !== undefined) {
            registerImportInstance(view, importScopeName);
        }

        if (isImplicitRoot) {
            markViewAsNonAddressable(view);
        }

        if (view instanceof ContainerView) {
            await view.initializeChildren();
        }

        view.registerStepSizeInvalidation();

        return view;
    }
}

/**
 * @param {string} name
 * @param {View} view Start searching from this view, then search within its parent, etc.
 */
function findTemplate(name, view) {
    const template = view.spec?.templates?.[name];
    if (template) {
        // Ensure that the template is not altered
        return structuredClone(template);
    }

    if (view.dataParent) {
        return findTemplate(name, view.dataParent);
    } else {
        throw new Error(
            `Cannot find template "${name}" in current view or its ancestors!`
        );
    }
}

/**
 * @param {ViewSpec} importedSpec
 * @param {import("../spec/view.js").ImportSpec} importSpec
 */
function applyParamsToImportedSpec(importedSpec, importSpec) {
    if (importSpec.name != null) {
        importedSpec.name = importSpec.name;
    }

    if (importSpec.visible != null) {
        importedSpec.visible = importSpec.visible;
    }

    const params = isArray(importSpec.params)
        ? importSpec.params
        : isObject(importSpec.params)
          ? Object.entries(importSpec.params).map(([name, value]) => ({
                name,
                value,
            }))
          : [];

    if (!params.length) {
        return;
    }

    importedSpec.params ??= [];

    // Replace overridden parameters
    for (const param of params) {
        const index = importedSpec.params.findIndex(
            (p) => p.name == param.name
        );
        if (index >= 0) {
            importedSpec.params[index] = param;
        }
    }

    // Add missing parameters
    for (const param of params) {
        if (!importedSpec.params.some((p) => p.name == param.name)) {
            importedSpec.params.push(param);
        }
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
 * @param {object} spec
 * @returns {spec is import("../spec/view.js").ImportSpec}
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
 * @param {object} spec
 */
function isSampleSpec(spec) {
    return (
        "samples" in spec &&
        isObject(spec.samples) &&
        "spec" in spec &&
        isObject(spec.spec)
    );
}
