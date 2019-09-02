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
import { isSecondaryChannel, channelWithSecondarys, secondaryChannels } from './viewUtils';


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
            if (isSecondaryChannel(channel)) {
                // TODO: Secondary channels should be pulled up as "primarys".
                // Example: The titles of both y and y2 should be shown on the y axis 
                continue;
            }

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
        if (isSecondaryChannel(channel)) {
            throw new Error(`getDomain(${channel}), must only be called for primary channels!`);
        }

        const encodingSpec = this.getEncoding()[channel];
        const type = encodingSpec.type;
        const specDomain = encodingSpec && encodingSpec.scale && encodingSpec.scale.domain;
        if (specDomain) {
            if (type == "quantitative") {
                if (Array.isArray(specDomain) && specDomain.length >= 2) {
                    // Pick the first and last. May contain more than two if the scale is piecewise.
                    return new Interval(specDomain[0], specDomain[specDomain.length - 1]);
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

        let domain = this._extractDomain(channel, type);
        if (!domain) {
            console.warn(`No domain available for channel ${channel} on ${this.name}`);
        }

        const secondaryChannel = secondaryChannels[channel];
        if (secondaryChannel) {
            const secondaryDomain = this._extractDomain(secondaryChannel, type);
            if (secondaryDomain) {
                if (type == "quantitative") {
                    domain = domain.span(secondaryDomain);
                } else {
                    domain.add(secondaryDomain);
                }
            }
        }

        return domain;
    }

    /**
     * Extracts and caches the domain from the data.
     * 
     * @param {string} channel 
     * @param {string} type secondary channels have an implicit type based on the primary channel
     * @returns {Interval | DiscreteDomain | void}
     */
    _extractDomain(channel, type) {
        if (this._dataDomains[channel]) {
            return this._dataDomains[channel];
        }

        let domain;
        const data = this.getData().ungroupAll().data; // TODO: getter for flattened data

        const encodingSpec = this.getEncoding()[channel];

        if (encodingSpec && isString(encodingSpec.field)) {
            const accessor = this.context.accessorFactory.createAccessor(encodingSpec);
            // TODO: Optimize cases where accessor returns a constant
            domain = (encodingSpec.type || type) === "quantitative" ?
                Interval.fromArray(extent(data, accessor)) :
                new DiscreteDomain([...new Set(data.map(accessor))]);
        }

        this._dataDomains[channel] = domain;

        return domain;

        // TODO: value / constant
    }
}