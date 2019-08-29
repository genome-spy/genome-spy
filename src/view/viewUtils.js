import UnitView from './unitView';
import LayerView from './layerView';

/**
 * @typedef {Object} ViewContext 
 * @prop {import("../tracks/simpleTrack").default} [track]
 * @prop {import("../genomeSpy").default} genomeSpy TODO: Break genomeSpy dependency
 * @prop {function(string):import("../data/dataSource").default} getDataSource
 */

/**
 * @typedef {Object} MarkConfig
 * @prop {string} type
 * @prop {object} [tooltip]
 * @prop {object} [sorting]
 */

/**
 * @typedef {Object} EncodingSpec
 * @prop {string} type
 * @prop {Object} [axis] 
 * @prop {string} [field]
 * @prop {string} [value]
 * @prop {object} [scale]
 * @prop {object} [sort]
 * @prop {string} [title]
 */

/**
 * @typedef {Object} Spec
 * @prop {string} [name]
 * @prop {Spec[]} [layer]
 * @prop {string | MarkConfig | object} [mark]
 * @prop {object} [data] 
 * @prop {object[]} [transform]
 * @prop {string} [sample]
 * @prop {Object.<string, EncodingSpec>} [encoding]
 * @prop {Object} [renderConfig]
 * @prop {string} [title]
 * @prop {Object} [resolve]
 */

/**
 * 
 * @param {Spec} spec 
 */
export function isUnitSpec(spec) {
    return typeof spec.mark === "string" || typeof spec.mark === "object";
}

/**
 * 
 * @param {Spec} spec 
 */
export function isLayerSpec(spec) {
    return typeof spec.layer === "object";
}

/**
 * 
 * @param {Spec} spec 
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
 * @param {Spec} spec 
 * @param {ViewContext} context 
 */
export function createView(spec, context) {
    const View = getViewClass(spec);
    return new View(spec, context, null, "root");
}