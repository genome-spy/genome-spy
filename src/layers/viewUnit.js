import { processData, transformData } from '../data/dataMapper';

import RectMark from '../layers/rectMark';
import PointMark from '../layers/pointMark';

/**
 * @typedef {Object} MarkConfig
 * @prop {string} type
 * @prop {object} [tooltip]
 * @prop {object} [sorting]
 */

/**
 * @typedef {Object} ViewUnitConfig
 * @prop {ViewUnitConfig[]} [layer]
 * @prop {string | MarkConfig | object} [mark]
 * @prop {object} [data] 
 * @prop {object[]} [transform]
 * @prop {string} [sample]
 * @prop {Object} [encoding]
 * @prop {Object} [renderConfig]
 * @prop {string} [title]
 * 
 * @typedef {Object} UnitContext
 * @prop {import("../tracks/sampleTrack/sampleTrack").default} [sampleTrack]
 * @prop {import("../genomeSpy").default} genomeSpy
 * @prop {function(string):import("../data/dataSource").default} getDataSource
 */

// TODO: Find a proper place
export const markTypes = {
    "point": PointMark,
    "rect": RectMark
};

 /**
  * Generic data layer base class
  */
export default class ViewUnit {

    /**
     * @param {UnitContext} context
     * @param {ViewUnit} parentUnit
     * @param {ViewUnitConfig} config
     */
    constructor(context, parentUnit, config) {
        this.context = context;
        this.parentUnit = parentUnit;
        this.config = config; 

        this.layers = (config.layer || [])
            .map(unitConfig => new ViewUnit(context, this, unitConfig));
    }

    /**
     * @returns {import("../data/group").Group}
     */
    getData() {
        if (this.data) {
            return this.data;
        }

        if (this.parentUnit) {
            return this.parentUnit.getData();
        }

        return null;
    }

    getRenderConfig() {
        const pe = this.parentUnit ? this.parentUnit.getRenderConfig() : {};
        const te = this.config.renderConfig || {};

        return Object.assign({}, pe, te);
    }

    getEncoding() {
        const pe = this.parentUnit ? this.parentUnit.getEncoding() : {};
        const te = this.config.encoding || {};

        return Object.assign({}, pe, te);
    }

    getVariableChannels() {
        // TODO: Test presence of field and chrom/pos instead of missingness value
        return Object.entries(this.getEncoding())
            .filter(entry => typeof entry[1].value == "undefined")
            .map(entry => entry[0]);
    }

    /**
     * @return {Object}
     */
    getConstantValues() {
        return Object.fromEntries(
            Object.entries(this.getEncoding())
                .filter(entry => typeof entry[1].value != "undefined")
                .map(entry => [entry[0], entry[1].value]));
    }


    async initialize() {
        if (this.config.data) {
            this.data = await this.context.getDataSource(this.config.data).getData();
        }

        if (this.config.transform) {
            this.data = transformData(this.config.transform, this.getData());
        }

        if (this.config.mark) {
            const data = this.getData();
            if (!data) {
                throw new Error("Can not create mark, no data available!");
            }

            const ungroupedData = data.ungroupAll().data;

            const encoding = this.getEncoding();
            if (!encoding) {
                // Actually, in future, we might have a mark that takes no encodings
                throw new Error("Can not create mark, no encodings specified!");
            }

            const markClass = markTypes[typeof this.config.mark == "object" ? this.config.mark.type : this.config.mark];
            if (markClass) {
                /** @type {import("./mark").default} */
                const mark = new markClass(this.context, this);
                const baseObject = {
                    _viewUnit: this
                };
                const specs = processData(encoding, ungroupedData, this.context.genomeSpy.visualMapperFactory, baseObject);
                mark.setSpecs(specs);
                await mark.initialize();

                this.mark = mark;

            } else {
                throw new Error(`No such mark: ${this.config.mark}`);
            }
        }
        // TODO: Warn if mark is missing and current ViewUnit node is a leaf

        for (const viewUnit of this.layers) {
            await viewUnit.initialize();
        }

    }

    /**
     * 
     * @param {function(ViewUnit):void} visitor 
     */
    visit(visitor) {
        // TODO: Consider generator
        visitor(this);

        for (const viewUnit of this.layers) {
            viewUnit.visit(visitor);
        }
    }

}