import { isObject, isString, isArray } from "vega-util";

import UnitView from "./unitView";
import ImportView from "./importView";
import LayerView from "./layerView";
import FacetView from "./facetView";
import SampleView from "./sampleView/sampleView";
import ConcatView from "./concatView";
import AxisWrapperView from "./axisWrapperView";
import { VISIT_SKIP } from "./view";

/**
 * @typedef {Object} ViewContext
 * @prop {import("../genomeSpy").default} genomeSpy TODO: Break genomeSpy dependency
 * @prop {function(import("../spec/data").Data, string):import("../data/dataSource").default} getDataSource
 * @prop {import("../encoder/accessor").default} accessorFactory
 * @prop {import("../coordinateSystem").default} coordinateSystem
 * @prop {import("../gl/webGLHelper").default} glHelper
 */

/**
 * @typedef {import("../spec/view").MarkConfig} MarkConfig
 * @typedef {import("../spec/view").EncodingConfig} EncodingConfig
 * @typedef {import("../spec/view").ContainerSpec} ContainerSpec
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("../spec/view").FacetSpec} FacetSpec
 * @typedef {import("../spec/view").SampleSpec} SampleSpec
 * @typedef {import("../spec/view").UnitSpec} UnitSpec
 * @typedef {import("../spec/view").VConcatSpec} VConcatSpec
 * @typedef {import("../spec/view").HConcatSpec} HConcatSpec
 * @typedef {import("../spec/view").ConcatSpec} ConcatSpec
 * @typedef {VConcatSpec | HConcatSpec | ConcatSpec} AnyConcatSpec
 * @typedef {import("../spec/view").ImportSpec} ImportSpec
 * @typedef {import("../spec/view").ImportConfig} ImportConfig
 * @typedef {import("../spec/view").RootSpec} RootSpec
 * @typedef {import("../spec/view").RootConfig} RootConfig
 * @typedef {import("./view").default} View
 *
 * @typedef {import("../spec/view").FacetFieldDef} FacetFieldDef
 * @typedef {import("../spec/view").FacetMapping} FacetMapping
 */

const viewTypes = [
    { prop: "import", guard: isImportSpec, viewClass: ImportView },
    { prop: "layer", guard: isLayerSpec, viewClass: LayerView },
    { prop: "facet", guard: isFacetSpec, viewClass: FacetView },
    { prop: "sample", guard: isSampleSpec, viewClass: SampleView },
    { prop: "mark", guard: isUnitSpec, viewClass: UnitView },
    { prop: "vconcat", guard: isVConcatSpec, viewClass: ConcatView },
    { prop: "hconcat", guard: isHConcatSpec, viewClass: ConcatView },
    { prop: "concat", guard: isConcatSpec, viewClass: ConcatView }
];

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

/**
 *
 * @param {FacetFieldDef | FacetMapping} spec
 * @returns {spec is FacetFieldDef}
 */
export function isFacetFieldDef(spec) {
    return "field" in spec && isString(spec.field);
}

/**
 *
 * @param {FacetFieldDef | FacetMapping} spec
 * @returns {spec is FacetMapping}
 */
export function isFacetMapping(spec) {
    return (
        ("row" in spec && isObject(spec.row)) ||
        ("column" in spec && isObject(spec.column))
    );
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is ViewSpec}
 */
export function isViewSpec(spec) {
    const matches = viewTypes
        .map(v => (v.guard(spec) ? v.prop : undefined))
        .filter(prop => isString(prop));

    if (matches.length > 1) {
        // TODO: test
        throw new Error(
            "Ambiguous spec, multiple properties: " + matches.join(", ")
        );
    }

    return matches.length == 1;
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
 * @param {object} config
 * @returns {config is ImportConfig}
 */
export function isImportConfig(config) {
    return "name" in config || "url" in config;
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
 * @param {ViewSpec | ImportSpec} spec
 * @returns {typeof View}
 */
export function getViewClass(spec) {
    for (const viewType of viewTypes) {
        if (viewType.guard(spec)) {
            return viewType.viewClass;
        }
    }
    throw new Error(
        "Invalid spec, cannot figure out the view: " + JSON.stringify(spec)
    );
}

/**
 *
 * @param {ViewSpec} spec
 * @param {ViewContext} context
 */
export function createView(spec, context) {
    const ViewClass = getViewClass(spec);
    return /** @type {View} */ (new ViewClass(
        spec,
        context,
        null,
        spec.name || "root"
    ));
}

/**
 * Returns all marks in the order (DFS) they are rendered
 * @param {View} root
 */
export function getMarks(root) {
    return getFlattenedViews(root)
        .filter(view => view instanceof UnitView)
        .map(view => /** @type {UnitView} */ (view).mark);
}

/**
 * Returns the nodes of the view hierarchy in depth-first order.
 *
 * @param {View} root
 */
export function getFlattenedViews(root) {
    /** @type {View[]} */
    const views = [];
    root.visit(view => {
        views.push(view);
    });
    return views;
}

/**
 * @param {View} root
 */
export function resolveScales(root) {
    root.visit(view => {
        if (view instanceof UnitView) {
            view.resolve();
        }
    });
}

/**
 * @param {View} root
 */
export function addAxisWrappers(root) {
    let newRoot = root; // If the root is wrapped...

    /** @param {EncodingConfig} encodingConfig */
    const hasDomain = encodingConfig =>
        encodingConfig && !("value" in encodingConfig);

    root.visit(view => {
        if (view instanceof LayerView || view instanceof UnitView) {
            const encoding = view.getEncoding();
            if (
                view instanceof UnitView &&
                !hasDomain(encoding.x) &&
                !hasDomain(encoding.y)
            ) {
                // Don't wrap views that have no positional channels
                // TODO: However, in future, views with borders or backgrounds should be wrapped always
                // TODO: Also, views with "axis: null" need no wrapping.
                // TODO: Handle LayerViews, they may have children with positional domains
                return VISIT_SKIP;
            }

            const originalParent = view.parent;
            const axisWrapperView = new AxisWrapperView(
                view.context,
                originalParent
            );
            view.parent = axisWrapperView;
            axisWrapperView.child = view;

            if (originalParent) {
                originalParent.replaceChild(view, axisWrapperView);
            }

            axisWrapperView.resolutions = view.resolutions;
            axisWrapperView.name = view.name;
            axisWrapperView.spec.height = view.spec.height;
            axisWrapperView.spec.width = view.spec.width;
            axisWrapperView.spec.padding = view.spec.padding;

            view.resolutions = {};
            view.name = "axisWrapped_" + view.name;
            view.spec.height = "container";
            view.spec.width = "container";
            view.spec.padding = undefined;

            if (view === root) {
                newRoot = axisWrapperView;
            }

            axisWrapperView.initialize();

            return VISIT_SKIP;
        }
    });

    return newRoot;
}

/**
 * @param {View} root
 */
export async function initializeData(root) {
    /** @type {Promise<void>[]} */
    const promises = [];

    root.visit(view => {
        // TODO: Add view to exceptions. Does not work now
        promises.push(view.loadData());
    });
    await Promise.all(promises);

    root.visit(view => view.transformData());

    root.visit(view => {
        if (view instanceof UnitView) {
            view.mark.initializeData();
        }
    });
}

/**
 *
 * @param {View} view
 */
export function findEncodedFields(view) {
    /** @type {{view: View, channel: string, field: string, type: string}[]} */
    const fieldInfos = [];

    view.visit(view => {
        if (view instanceof UnitView) {
            const encoding = view.getEncoding();
            for (const [channel, def] of Object.entries(encoding)) {
                const field = def.field;
                if (field) {
                    fieldInfos.push({ view, channel, field, type: def.type });
                }
            }
        }
    });

    return fieldInfos;
}
