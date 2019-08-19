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
        const encodings = [];

        this.visit(vu => {
            if (!vu.mark) {
                return;
            }

            const md = vu.mark.getDomain(channel);
            if (!md) {
                return;

            } else if (!domain) {
                domain = md;

            } else if (domain instanceof Interval && md instanceof Interval) {
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

            const encoding = vu.mark.getEncoding()[channel];
            if (encoding) {
                encodings.push(encoding);
            }
        })

        return Object.assign(Object.create(domain), { encodings });
    }


    /**
     * Returns a array of mark groups that have common scales, etc
     * N.B. Call this at root!
     * 
     * @param {string} channel 
     */
    resolve(channel) {
        const groups = [];

        dfs(this);

        return groups;

        /**
         * 
         * @param {ViewUnit} viewUnit 
         * @param {string} [state]
         * @param {array} [sharedGroup]
         */
        function dfs(viewUnit, state, sharedGroup) {
            if (viewUnit.mark) {
                if (sharedGroup) {
                    sharedGroup.push(viewUnit.mark);
                } else {
                    groups.push([viewUnit.mark]);
                }
                return;
            }

            if (!viewUnit.layers) {
                return;
            }

            if (viewUnit.getEncoding()[channel]) {
                // Default to shared for all channels.
                // This needs to be adjusted when concatenation and others are implemented
                const choice = viewUnit.config.resolve && viewUnit.config.resolve.scale && viewUnit.config.resolve.scale[channel] || "shared";

                switch (choice) {
                case "shared":
                    if (state !== "shared") {
                        sharedGroup = [];
                        groups.push(sharedGroup);
                    }
                    break;

                case "independent":
                    if (state === "shared") {
                        throw new Error("Having an independent resolution under a shared one is not allowed!");
                    }
                    break;

                default:
                    throw new Error(`Unknown resolution: ${choice}`);
                }

                state = choice;
            }


            for (const child of viewUnit.layers) {
                dfs(child, state, sharedGroup)
            }
        }
    }
}