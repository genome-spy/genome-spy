import { processData, transformData } from '../data/dataMapper';

import Interval from '../utils/interval';
import RectMark from './rectMark';
import PointMark from './pointMark';
import RuleMark from './rule';

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
 * @prop {Object} [resolve]
 * 
 * @typedef {Object} UnitContext
 * @prop {import("../tracks/sampleTrack/simpleTrack").default} [track]
 * @prop {import("../genomeSpy").default} genomeSpy
 * @prop {function(string):import("../data/dataSource").default} getDataSource
 */

// TODO: Find a proper place
export const markTypes = {
    "point": PointMark,
    "rect": RectMark,
    "rule": RuleMark
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

        // TODO: "subunits" which may be layered or stacked (concatenated) vertically
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

    async initialize() {
        if (this.config.data) {
            this.data = await this.context.getDataSource(this.config.data).getData();
        }

        if (this.config.transform) {
            this.data = transformData(this.config.transform, this.getData());
        }

        if (this.config.mark) {
            const markClass = markTypes[typeof this.config.mark == "object" ? this.config.mark.type : this.config.mark];
            if (markClass) {
                /** @type {import("./mark").default} */
                const mark = new markClass(this.context, this);
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
        visitor(this);

        for (const viewUnit of this.layers) {
            viewUnit.visit(visitor);
        }
    }

    /**
     * Collects the unioned domain for the specified channel in the view hierarchy, starting
     * from this node.
     * 
     * @param {string} channel 
     * @returns {Interval | string[] | void}
     */
    getUnionDomain(channel) {
        /** @type{Interval | string[]} */
        let domain;

        this.visit(vu => {
            if (vu.mark) {
                const md = vu.mark.getDomain(channel);
                if (!md) {
                    return;

                } else if (!domain) {
                    domain = md;

                } else {
                    if (domain instanceof Interval && md instanceof Interval) {
                        domain = domain.span(md);

                    } else if (Array.isArray(domain) && Array.isArray(md)) {
                        // Inefficient but preserves order
                        for (const value of md) {
                            if (!domain.includes(value)) {
                                domain.push(value);
                            }
                        }

                    } else {
                        throw new Error(`Mismatching types. Can't union domains for channel ${channel}.`);
                    }
                }
            }
        })

        return domain;
    }
}