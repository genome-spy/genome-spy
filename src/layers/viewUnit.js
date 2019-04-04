import { tsvParse } from 'd3-dsv';
import { processData, transformData, groupBySample } from '../data/dataMapper';

import RectMark from '../layers/rectMark';
import PointMark from '../layers/pointMark';

/**
 * @typedef {Object} ViewUnitConfig
 * @prop {ViewUnitConfig[]} [layer]
 * @prop {string} [mark]
 * @prop {object} [data] 
 * @prop {object[]} [transform]
 * @prop {string} [sample]
 * @prop {Object} [encoding]
 * 
 * @typedef {Object} UnitContext
 * @prop {import("../tracks/sampleTrack/sampleTrack").default} [sampleTrack]
 * @prop {import("../genomeSpy").default} genomeSpy
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

    async fetchData(dataConfig) {
        // TODO: Support "dataSource", immediate data as objects, etc...
        // TODO: Create an own module for data loading
        const dataFiles = typeof dataConfig.url == "string" ?
            [dataConfig.url] :
            dataConfig.url;

        const urls = dataFiles.map(filename => this.context.genomeSpy.config.baseurl + filename);

        return Promise.all(urls.map(url => fetch(url).then(data => data.text())));
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

    getEncoding() {
        const pe = this.parentUnit ? this.parentUnit.getEncoding() : undefined;
        const te = this.config.encoding;

        if (te) {
            if (pe) {
                return Object.assign({}, pe, te);

            } else {
                return te;
            }

        } else {
            return pe;
        }
    }


    async initialize() {

        if (this.config.data) {
            const rawDataFiles = await this.fetchData(this.config.data);
            this.data = rawDataFiles.map(d => tsvParse(d));

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

            if (!this.config.sample) {
                // TODO: Consider moving sample to encoding
                throw new Error("Sample column has not been defined!");
            }

            const markClass = markTypes[this.config.mark];
            if (markClass) {
                /** @type {import("./mark").default} */
                const mark = new markClass(this.context);
                const specs = processData(encoding, concatedData, this.context.genomeSpy.visualMapperFactory);
                const specsBySample = groupBySample(concatedData, specs, d => d[this.config.sample])
                mark.setSpecs(specsBySample);
                await mark.initialize();

                this.mark = mark;

            } else {
                throw new Error(`No such mark: ${this.config.mark}`);
            }
        }

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