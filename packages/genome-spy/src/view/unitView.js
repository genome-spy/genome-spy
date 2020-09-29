import RectMark from "../marks/rectMark";
import PointMark from "../marks/pointMark";
import RuleMark from "../marks/rule";
import ConnectionMark from "../marks/connection";
import TextMark from "../marks/text";

import View from "./view";
import ContainerView from "./containerView";
import Resolution from "./resolution";
import {
    isSecondaryChannel,
    secondaryChannels,
    primaryChannel
} from "../encoder/encoder";
import createDomain from "../utils/domainArray";
import { parseSizeDef } from "../utils/layout/flexLayout";

/**
 * @typedef {import("./layerView").default} LayerView
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../encoder/accessor").Accessor} Accessor
 */

/**
 * @type {Object.<string, typeof import("../marks/mark").default>}
 * TODO: Find a proper place, make extendible
 */
export const markTypes = {
    point: PointMark,
    rect: RectMark,
    rule: RuleMark,
    connection: ConnectionMark,
    text: TextMark
};

/**
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
 */
export default class UnitView extends View {
    /**
     *
     * @param {import("../spec/view").UnitSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {import("./containerView").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec; // Set here again to keep types happy

        /**
         * Cache for extracted domains
         * @type {Record<string, DomainArray>}
         */
        this._dataDomains = {};

        /**
         * Cache for accessors
         * @type {Record<string, Accessor>}
         */
        this._accessors = {};

        const Mark = markTypes[this.getMarkType()];
        if (Mark) {
            /** @type {import("../marks/mark").default} */
            this.mark = new Mark(this);
        } else {
            throw new Error(`No such mark: ${this.getMarkType()}`);
        }
    }

    getMarkType() {
        return typeof this.spec.mark == "object"
            ? this.spec.mark.type
            : this.spec.mark;
    }

    /**
     * Pulls scales up in the view hierarcy according to the resolution rules.
     * TODO: Axes, legends
     */
    resolve() {
        // TODO: Complain about nonsensical configuration, e.g. shared parent has independent children.

        const encoding = this.getEncoding();
        // eslint-disable-next-line guard-for-in
        for (const channel in encoding) {
            if (isSecondaryChannel(channel)) {
                // TODO: Secondary channels should be pulled up as "primarys".
                // Example: The titles of both y and y2 should be shown on the y axis
                continue;
            }

            if (!this.getAccessor(channel)) {
                // The channel has no fields or anything, so it's likely just a "value". Let's skip.
                continue;
            }

            // eslint-disable-next-line consistent-this
            let view = this;
            while (
                view.parent instanceof ContainerView &&
                view.parent.getConfiguredOrDefaultResolution(channel) ==
                    "shared"
            ) {
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
        channel = primaryChannel(channel);

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
     *
     * @param {string} channel
     */
    getAccessor(channel) {
        if (this._accessors.hasOwnProperty(channel)) {
            return this._accessors[channel];
        }

        const encoding = this.mark.getEncoding(); // Mark provides encodings with defaults and possible modifications
        if (encoding && encoding[channel]) {
            const accessor = this.context.accessorFactory.createAccessor(
                encoding[channel]
            );
            this._accessors[channel] = accessor;
            return accessor;
        }
    }

    _getCoordinateSystemExtent() {
        const cs = this.context.coordinateSystem;
        return (cs && cs.getExtent()) || undefined;
    }

    /**
     * Returns the domain of the specified channel of this domain/mark.
     * Either returns the configured domain or extracts it from the data.
     *
     * @param {string} channel
     * @returns {DomainArray}
     */
    getDomain(channel) {
        if (isSecondaryChannel(channel)) {
            throw new Error(
                `getDomain(${channel}), must only be called for primary channels!`
            );
        }

        const encodingSpec = this.getEncoding()[channel];
        const type = encodingSpec.type;
        if (!type) {
            throw new Error(`No data type for channel "${channel}"!`);
            // TODO: Support defaults
        }
        const specDomain =
            encodingSpec && encodingSpec.scale && encodingSpec.scale.domain;
        if (specDomain) {
            return createDomain(type, specDomain);
        }

        let domain = this._extractDomain(channel, type);
        if (!domain) {
            console.warn(
                `Cannot extract domain for channel "${channel}" on ${this.getPathString()}. You can specify it explicitly.`
            );
        }

        const secondaryChannel = secondaryChannels[channel];
        if (secondaryChannel) {
            const secondaryDomain = this._extractDomain(secondaryChannel, type);
            if (secondaryDomain) {
                domain.extendAll(secondaryDomain);
            }
        }

        return domain;
    }

    /**
     * Extracts and caches the domain from the data.
     *
     * @param {string} channel
     * @param {string} type secondary channels have an implicit type based on the primary channel
     * @returns {DomainArray}
     */
    _extractDomain(channel, type) {
        if (this._dataDomains[channel]) {
            return this._dataDomains[channel];
        }

        let domain;

        const data = this.getData();

        const encodingSpec = this.getEncoding()[channel];

        if (encodingSpec) {
            const accessor = this.context.accessorFactory.createAccessor(
                encodingSpec
            );
            if (accessor) {
                domain = createDomain(type);

                if (accessor.constant) {
                    domain.extend(accessor({}));
                } else {
                    for (const datum of data.flatData()) {
                        domain.extend(accessor(datum));
                    }
                }
            }
        }

        this._dataDomains[channel] = domain;

        return domain;
    }
}
