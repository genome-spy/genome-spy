import ImportView from "./importView";
import UnitView from "./unitView";
import LayerView from "./layerView";
import { configureDefaultResolutions } from "./resolution";
import ConcatView from "./concatView";

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
 * @typedef {import("../spec/view").ConcatSpec} ConcatSpec
 * @typedef {import("../spec/view").ImportSpec} ImportSpec
 * @typedef {import("../spec/view").ImportConfig} ImportConfig
 * @typedef {import("../spec/view").RootSpec} RootSpec
 * @typedef {import("../spec/view").RootConfig} RootConfig
 * @typedef {import("./view").default} View
 */

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is UnitSpec}
 */
export function isUnitSpec(spec) {
    return typeof spec.mark === "string" || typeof spec.mark === "object";
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is LayerSpec}
 */
export function isLayerSpec(spec) {
    return typeof spec.layer === "object";
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is ViewSpec}
 */
export function isViewSpec(spec) {
    return isUnitSpec(spec) || isLayerSpec(spec) || isConcatSpec(spec);
}

/**
 *
 * @param {ViewSpec} spec
 * @returns {spec is ConcatSpec}
 */
export function isConcatSpec(spec) {
    return Array.isArray(spec.concat);
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
    if (isImportSpec(spec)) {
        return ImportView;
    } else if (isUnitSpec(spec)) {
        return UnitView;
    } else if (isLayerSpec(spec)) {
        return LayerView;
    } else if (isConcatSpec(spec)) {
        return ConcatView;
    } else {
        throw new Error(
            "Invalid spec, cannot figure out the view: " + JSON.stringify(spec)
        );
    }
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

    // Actually configures some hacky scales
    configureDefaultResolutions(root);
}

/**
 *
 * @param {View} view
 */
export function addAxisView(view) {
    // TODO: Don't add axis if one already exists
    const xResolution = view.resolutions["x"];
    if (xResolution.getAxisProps()) {
        if (view instanceof ConcatView) {
            view.children.push(
                createView({ import: { name: "axis" } }, view.context)
            );
            return view;
        } else {
            // Create a new view root, which will have the the original view
            // and the new axis view as its children
            const newRoot = createView(
                {
                    name: "implicit_root",
                    concat: [{ import: { name: "axis" } }]
                },
                view.context
            );
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
