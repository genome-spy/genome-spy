import {
    field,
    isString
} from 'vega-util';

import {
    extent
} from 'd3-array';

import RectMark from '../marks/rectMark';
import PointMark from '../marks/pointMark';
import RuleMark from '../marks/rule';

import ContainerView from './containerView';
import Resolution from './resolution';
import Interval from '../utils/interval';
import DiscreteDomain from '../utils/discreteDomain';


// TODO: Find a proper place, make extendible
export const markTypes = {
    point: PointMark,
    rect: RectMark,
    rule: RuleMark
};

/**
 * @typedef {(Interval | DiscreteDomain)} Domain
 */

export default class UnitView extends ContainerView { 

    /**
     * 
     * @param {import("./viewUtils").Spec} spec
     * @param {import("./viewUtils").ViewContext} context 
     * @param {import("./view").default} parent 
     * @param {string} name 
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name)

        /**
         * Cache for extracted domains
         * @type {Object.<string, Domain>}
         */
        this._dataDomains = {};

        /** @type {string} */
        const markType = typeof this.spec.mark == "object" ? this.spec.mark.type : this.spec.mark;
        const Mark = markTypes[markType];
        if (Mark) {
            /** @type {import("../marks/mark").default} */
            this.mark = new Mark(this);

        } else {
            throw new Error(`No such mark: ${markType}`);
        }

        //this.resolve();
    }

    /**
     * Pulls scales up in the view hierarcy according to the resolution rules.
     * TODO: Axes, legends
     */
    resolve() {
        // TODO: Complain about nonsensical configuration, e.g. shared parent has independent children.
        // TODO: Remove and complain about extra channels.
        
        // eslint-disable-next-line guard-for-in
        for (const channel in this.getEncoding()) {
            // eslint-disable-next-line consistent-this
            let view = this;
            while (view.parent instanceof ContainerView && view.parent.getConfiguredOrDefaultResolution(channel) == "shared") {
                // @ts-ignore
                view = view.parent;
            }

            if (!view.resolutions[channel]) {
                view.resolutions[channel] = new Resolution(channel);
            }

            view.resolutions[channel].pushUnitView(this);
        }
    }

    /**
     * 
     * @param {string} channel 
     */
    getResolution(channel) {
        /** @type {import("./view").default } */
        // eslint-disable-next-line consistent-this
        let view = this;
        do {
            if (view.resolutions[channel]) {
                return view.resolutions[channel];
            }
            view = view.parent;
        } while (view);
    }

    /**
     * Returns the domain of the specified channel of this domain/mark.
     * Either returns a configured domain or extracts it from the data.
     * 
     * @param {string} channel 
     * @returns {Interval | DiscreteDomain | void}
     */
    getDomain(channel) {
        const encodingSpec = this.getEncoding()[channel];
        const specDomain = encodingSpec && encodingSpec.scale && encodingSpec.scale.domain;
        if (specDomain) {
            if (encodingSpec.type == "quantitative") {
                // TODO: What about piecewise scales?
                if (Array.isArray(specDomain) && specDomain.length == 2) {
                    return Interval.fromArray(specDomain);
                } else {
                    throw new Error("Invalid domain: " + JSON.stringify(specDomain));
                }
            } else {
                return new DiscreteDomain(specDomain);
            }
        }

        // Note: encoding should be always present. Rules are an exception, though.
        // A horizontal rule has implicit encoding for x channel and an infinite domain.
        // The same applies to vertical rules. It's hacky and may need some fixing.

        // TODO: Include constant values defined in encodings
        const domain = this.extractDomain(channel);
        if (!domain) {
            console.warn(`No domain available for channel ${channel} on ${this.name}`);
        }

        return domain;
    }

    /**
     * Extracts and cacheds the domain from the data.
     * 
     * @param {string} channel 
     * @returns {Interval | DiscreteDomain | void}
     */
    extractDomain(channel) {
        if (this._dataDomains[channel]) {
            return this._dataDomains[channel];
        }

        let domain;
        const data = this.getData().ungroupAll().data; // TODO: getter for flattened data

        const encodingSpec = this.getEncoding()[channel];

        if (isString(encodingSpec.field)) {
            const a = field(encodingSpec.field);
            domain = encodingSpec.type === "quantitative" ?
                Interval.fromArray(extent(data, a)) :
                new DiscreteDomain([...new Set(data.map(a))]);
        }

        this._dataDomains[channel] = domain;

        return domain;

        // TODO: value / constant
    }
}