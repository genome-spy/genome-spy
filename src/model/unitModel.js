import {
    accessor,
    isString
} from 'vega-util';

import {
    extent
} from 'd3-array';

import RectMark from '../marks/rectMark';
import PointMark from '../marks/pointMark';
import RuleMark from '../marks/rule';

import ContainerModel from "./containerModel";
import Resolution from './resolution';
import Interval from '../utils/interval';
import DiscreteDomain from '../utils/discreteDomain';


// TODO: Find a proper place, make extendible
export const markTypes = {
    "point": PointMark,
    "rect": RectMark,
    "rule": RuleMark
};

export default class UnitModel extends ContainerModel { 

    /**
     * 
     * @param {*} context 
     * @param {import("./containerModel").ContainerModel} parent 
     * @param {string} name 
     * @param {import("./model").Spec} spec
     */
    constructor(context, parent, name, spec) {
        super(context, parent, name, spec);

        /** Cache for extracted domains */
        this._dataDomains = {};

        const markType = typeof this.spec.mark == "object" ? this.spec.mark.type : this.spec.mark;
        const Mark = markTypes[markType];
        if (Mark) {
            /** @type {import("../marks/mark").default} */
            this.mark = new Mark(null, this); // TODO: Context

        } else {
            throw new Error(`No such mark: ${markType}`);
        }
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
            let model = this;
            while (model.parent instanceof ContainerModel && model.parent.getConfiguredOrDefaultResolution(channel) == "shared") {
                // @ts-ignore
                model = model.parent;
            }

            if (!model.resolutions[channel]) {
                model.resolutions[channel] = new Resolution(channel);
            }

            model.resolutions[channel].pushUnitModel(this);
        }
    }

    /**
     * Returns the domain of the specified channel of this mark.
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
            console.warn(`No domain available for channel ${channel}`);
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
        const data = this.getData();
        const encodingSpec = this.getEncoding()[channel];

        if (isString(encodingSpec.field)) {
            const a = accessor(encodingSpec.field);
            domain = encodingSpec.type === "quantitative" ?
                Interval.fromArray(extent(data, a)) :
                new DiscreteDomain([...new Set(data.map(a))]);
        }

        this._dataDomains[channel] = domain;

        return domain;

        // TODO: value / constant

    }
}