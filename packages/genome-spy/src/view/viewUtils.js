import { isObject, isString, isArray } from "vega-util";

import ImportView from "./importView";
import LayerView from "./layerView";
import UnitView from "./unitView";
import VConcatView from "./vConcatView";
import TableView from "./tableView";
import TableRowView from "./tableRowView";

/**
 * @typedef {Object} ViewContext
 * @prop {import("../genomeSpy").default} genomeSpy TODO: Break genomeSpy dependency
 * @prop {function(import("../spec/data").Data, string):import("../data/dataSource").default} getDataSource
 * @prop {import("../encoder/accessor").default} accessorFactory
 * @prop {import("../coordinateSystem").default} coordinateSystem
 */

/**
 * @typedef {import("../spec/view").MarkConfig} MarkConfig
 * @typedef {import("../spec/view").EncodingConfig} EncodingConfig
 * @typedef {import("../spec/view").ContainerSpec} ContainerSpec
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("../spec/view").UnitSpec} UnitSpec
 * @typedef {import("../spec/view").VConcatSpec} VConcatSpec
 * @typedef {import("../spec/view").HConcatSpec} HConcatSpec
 * @typedef {import("../spec/view").TableSpec} TableSpec
 * @typedef {import("../spec/view").TableRowSpec} TableRowSpec
 * @typedef {import("../spec/view").ImportSpec} ImportSpec
 * @typedef {import("../spec/view").ImportConfig} ImportConfig
 * @typedef {import("../spec/view").RootSpec} RootSpec
 * @typedef {import("../spec/view").RootConfig} RootConfig
 * @typedef {import("./view").default} View
 */

const viewTypes = [
    { prop: "import", guard: isImportSpec, viewClass: ImportView },
    { prop: "layer", guard: isLayerSpec, viewClass: LayerView },
    { prop: "mark", guard: isUnitSpec, viewClass: UnitView },
    { prop: "vconcat", guard: isVConcatSpec, viewClass: VConcatView },
    { prop: "table", guard: isTableSpec, viewClass: TableView },
    { prop: "main", guard: isTableRowSpec, viewClass: TableRowView }
];

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is UnitSpec}
 */
export function isUnitSpec(spec) {
    return isString(spec.mark) || isObject(spec.mark);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is LayerSpec}
 */
export function isLayerSpec(spec) {
    return isObject(spec.layer);
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
    return isArray(spec.concat);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is TableSpec}
 */
export function isTableSpec(spec) {
    return isArray(spec.table);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is TableRowSpec}
 */
export function isTableRowSpec(spec) {
    return !!spec.main;
}

/**
 *
 * @param {object} config
 * @returns {config is ImportConfig}
 */
export function isImportConfig(config) {
    return config.name || config.url;
}

/**
 *
 * @param {object} spec
 * @returns {spec is ImportSpec}
 */
export function isImportSpec(spec) {
    return !!spec.import;
}

/**
 *
 * @param {ViewSpec | ImportSpec} spec
 * @returns {typeof View}
 */
export function getViewClass(spec) {
    if (isLayerSpec(spec)) {
        // WTF hack! Something int the loop below deletes LayerView in Jest tests !?
        return LayerView;
    }

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
 *
 * @param {View} view
 */
export function addAxisView(view) {
    // TODO: Don't add axis if one already exists
    const xResolution = view.resolutions["x"];
    if (xResolution && xResolution.getAxisProps()) {
        if (view instanceof VConcatView) {
            view.children.push(
                createView({ import: { name: "axis" } }, view.context)
            );
            return view;
        } else {
            // Create a new view root, which will have the the original view
            // and the new axis view as its children
            const newRoot = /** @type {import("./containerView").default} */ (createView(
                {
                    name: "implicit_root",
                    concat: [{ import: { name: "axis" } }]
                },
                view.context
            ));
            newRoot.children.unshift(view);
            view.parent = newRoot;
            // Pull resolution to the new root
            newRoot.resolutions["x"] = view.resolutions["x"];
            delete view.resolutions["x"];
            return newRoot;
        }
    } else {
        return view;
    }
}

/**
 * @param {View} root
 */
export async function initializeData(root) {
    /** @type {Promise[]} */
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
