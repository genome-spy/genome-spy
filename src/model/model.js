import UnitModel from "./unitModel";
import LayerModel from "./layerModel";

import { processData, transformData } from '../data/dataMapper';

/**
 * @typedef {Object} EncodingSpec
 * @prop {string} type
 * @prop {string} [axis]
 * @prop {string} [field]
 * @prop {string} [value]
 * @prop {object} [scale]
 * @prop {object} [sort]
 */

/**
 * @typedef {Object} Spec
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

export default class Model {
    /**
     * 
     * @param {*} context 
     * @param {Model} parent 
     * @param {string} name 
     * @param {Spec} spec
     */
    constructor(context, parent, name, spec) {
        this.context = context;
        this.parent = parent;
        this.name = name;
        this.spec = spec;
        this.children = [];

        /** @type {Object.<string, import("./resolution").default>}  Resolved channels. Supports only scales for now.. */
        this.resolutions = {
        }
    }
    
    /**
     * 
     * @param {function(Model):void} visitor 
     */
    visit(visitor) {
        visitor(this);

        for (const viewUnit of this.children) {
            viewUnit.visit(visitor);
        }

        if (visitor.afterChildren) {
            visitor.afterChildren(this);
        }
    }

    /**
     * @return {Object.<string, EncodingSpec>}
     */
    getEncoding() {
        const pe = this.parent ? this.parent.getEncoding() : {};
        const te = this.spec.encoding || {};

        return {
            ...pe,
            ...te
        }
    }

    getRenderConfig() {
        const pe = this.parent ? this.parent.getRenderConfig() : {};
        const te = this.spec.renderConfig || {};

        return {
            ...pe,
            ...te
        };
    }

    /**
     * @returns {import("../data/group").Group}
     */
    getData() {
        // TODO: Redesign and replace with a more sophisticated data flow

        if (this.data) {
            return this.data;
        }

        if (this.parent) {
            return this.parent.getData();
        }

        return null;
    }

    async loadAndTransformData() {
        if (this.spec.data) {
            this.data = await this.context.getDataSource(this.spec.data).getData();
        }

        if (this.spec.transform) {
            this.data = transformData(this.spec.transform, this.getData());
        }
    }

}


export function isUnitSpec(spec) {
    return typeof spec.mark === "object";
}

export function isLayerSpec(spec) {
    return typeof spec.layer === "object";
}

export function getModelClass(spec) {
    if (isUnitSpec(spec)) {
        return UnitModel;
    } else if (isLayerSpec(spec)) {
        return LayerModel;
    } else {
        throw new Error("Invalid spec, cannot figure out a model: " + JSON.stringify(spec));
    }
}

export function createModel(spec) {
    const Model = getModelClass(spec);
    return new Model(null, null, "root", spec);
}