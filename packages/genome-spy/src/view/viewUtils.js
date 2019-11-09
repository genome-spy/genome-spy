import UnitView from "./unitView";
import LayerView from "./layerView";
import { configureDefaultResolutions } from "./resolution";

/**
 * @typedef {Object} ViewContext
 * @prop {import("../tracks/simpleTrack").default} [track]
 * @prop {import("../genomeSpy").default} genomeSpy TODO: Break genomeSpy dependency
 * @prop {function(import("../spec/data").Data):import("../data/dataSource").default} getDataSource
 * @prop {import("../encoder/accessor").default} accessorFactory
 * @prop {import("../coordinateSystem").default} coordinateSystem
 */

/**
 * @typedef {import("../spec/view").MarkConfig} MarkConfig
 * @typedef {import("../spec/view").EncodingConfig} EncodingConfig
 * @typedef {import("../spec/view").ViewSpec} ViewSpec
 * @typedef {import("../spec/view").LayerSpec} LayerSpec
 * @typedef {import("../spec/view").UnitSpec} UnitSpec
 * @typedef {import("../spec/view").TrackSpec} TrackSpec
 * @typedef {import("../spec/view").ImportSpec} ImportSpec
 * @typedef {import("../spec/view").ImportConfig} ImportConfig
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
 * @param {object} spec
 * @returns {spec is ViewSpec}
 */
export function isViewSpec(spec) {
    return isUnitSpec(spec) || isLayerSpec(spec);
}

/**
 *
 * @param {object} spec
 * @returns {spec is TrackSpec}
 */
export function isTrackSpec(spec) {
    return Array.isArray(spec.tracks);
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
 * @param {ViewSpec} spec
 * @returns {typeof View}
 */
export function getViewClass(spec) {
    if (isUnitSpec(spec)) {
        return UnitView;
    } else if (isLayerSpec(spec)) {
        return LayerView;
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
    return /** @type {View} */ (new ViewClass(spec, context, null, "root"));
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
    root.visit(view => views.push(view));
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
