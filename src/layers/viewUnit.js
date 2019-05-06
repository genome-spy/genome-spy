import { processData, transformData } from '../data/dataMapper';

import RectMark from '../layers/rectMark';
import PointMark from '../layers/pointMark';

/**
 * @typedef {Object} ViewUnitConfig
 * @prop {ViewUnitConfig[]} [layer]
 * @prop {string | object} [mark]
 * @prop {object} [data] 
 * @prop {object[]} [transform]
 * @prop {string} [sample]
 * @prop {Object} [encoding]
 * @prop {Object} [renderConfig]
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


    async initialize() {
        if (this.config.data) {
            this.data = await this.context.getDataSource(this.config.data).getDatasets();

            // TODO: Concat data frames if they have identical columns
        }

        if (this.config.transform) {
            const data = this.getData();
            this.data = data.map(dataFrame => transformData(this.config.transform, dataFrame));
        }

        if (this.config.mark) {
            const data = this.getData();
            if (!data) {
                // TODO: Check if all visual channels have constant values and create a single implicit data item
                throw new Error("Can not create mark, no data available!");
            }

            const concatedData = data.flat();

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
                const specs = processData(encoding, concatedData, this.context.genomeSpy.visualMapperFactory, baseObject);
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