import UnitView from './unitView';
import LayerView from './layerView';
import { configureDefaultResolutions } from './resolution';

/**
 * @typedef {Object} ViewContext 
 * @prop {import("../tracks/simpleTrack").default} [track]
 * @prop {import("../genomeSpy").default} genomeSpy TODO: Break genomeSpy dependency
 * @prop {function(string):import("../data/dataSource").default} getDataSource
 * @prop {import("../encoder/accessor").default} accessorFactory
 * @prop {import("../coordinateSystem").default} coordinateSystem
 */

/**
 * @typedef {import("../spec/view").MarkConfig} MarkConfig
 * @typedef {import("../spec/view").EncodingConfig} EncodingConfig
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("./view").default} View
/**
 * 
 * @param {ViewSpec} spec 
 */
export function isUnitSpec(spec) {
    return typeof spec.mark === "string" || typeof spec.mark === "object";
}

/**
 * 
 * @param {ViewSpec} spec 
 */
export function isLayerSpec(spec) {
    return typeof spec.layer === "object";
}

/**
 * 
 * @param {ViewSpec} spec 
 * @returns {typeof View} 
 */
export function getViewClass(spec) {
    if (isUnitSpec(spec)) {
        return UnitView;
    } else if (isLayerSpec(spec)) {
        return LayerView;
    } else {
        throw new Error("Invalid spec, cannot figure out the view: " + JSON.stringify(spec));
    }
}

/**
 * 
 * @param {ViewSpec} spec 
 * @param {ViewContext} context 
 */
export function createView(spec, context) {
    const ViewClass = getViewClass(spec);
    return /** @type {View} */(new ViewClass(spec, context, null, "root"));
}


/**
 * Returns all marks in the order (DFS) they are rendered
 * @param {View} root
 */
export function getMarks(root) {
    return getFlattenedViews(root)
        .filter(view => view instanceof UnitView)
        .map(view => (/** @type {UnitView} */(view)).mark)
}

/**
 * @param {View} root
 */
export function getFlattenedViews(root) {
    /** @type {View[]} */
    const views = [];
    root.visit(view => views.push(view));
    return views;
}

/**
 * @param {View} root
 */
export async function initializeViewHierarchy(root) {
    const views = getFlattenedViews(root);
    await Promise.all(views.map(view => view.loadData()));

    for (const view of views) {
        view.transformData();
    }

    for (const view of views) {
        if (view instanceof UnitView) {
            view.resolve();
        }
    }

    configureDefaultResolutions(root);

    for (const mark of getMarks(root)) {
        await mark.initializeData(); // TODO: async needed?
    }
}
