import RectMark from "../marks/rectMark";
import PointMark from "../marks/pointMark";
import RuleMark from "../marks/rule";
import ConnectionMark from "../marks/connection";
import TextMark from "../marks/text";

import View from "./view";
import ContainerView from "./containerView";
import ScaleResolution from "./scaleResolution";
import {
    isSecondaryChannel,
    secondaryChannels,
    primaryChannel,
    isPositionalChannel
} from "../encoder/encoder";
import createDomain from "../utils/domainArray";
import { getCachedOrCall } from "../utils/propertyCacher";
import AxisResolution from "./axisResolution";

/**
 *
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
 * @typedef {import("./layerView").default} LayerView
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../encoder/accessor").Accessor} Accessor
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
 * @typedef {import("./containerView").ResolutionType} ResolutionType
 *
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

        const Mark = markTypes[this.getMarkType()];
        if (Mark) {
            /** @type {import("../marks/mark").default} */
            this.mark = new Mark(this);
        } else {
            throw new Error(`No such mark: ${this.getMarkType()}`);
        }

        /**
         * Not nice! Inconsistent when faceting!
         * TODO: Something. Perhaps a Map that has coords for each facet or something...
         * @type {import("../utils/layout/rectangle").default}
         */
        this.coords = undefined;
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        coords = coords.shrink(this.getPadding());

        this.coords = coords;

        // Translate by half a pixel to place vertical / horizontal
        // rules inside pixels, not between pixels.
        // TODO: translation produces piles of garbage. Figure out something.
        // Perhaps translation could be moved to Mark.setViewport(coords)
        coords = coords.translate(0.5, 0.5);

        context.pushView(this, coords);
        context.renderMark(this.mark, options);
        context.popView(this);
    }

    getMarkType() {
        return typeof this.spec.mark == "object"
            ? this.spec.mark.type
            : this.spec.mark;
    }

    /**
     * Pulls scales and axes up in the view hierarcy according to the resolution rules.
     * TODO: legends
     *
     * @param {ResolutionType} type
     */
    resolve(type) {
        // TODO: Complain about nonsensical configuration, e.g. shared parent has independent children.

        const encoding = this.getEncoding();
        // eslint-disable-next-line guard-for-in
        for (const channel in encoding) {
            if (type == "axis" && !isPositionalChannel(channel)) {
                continue;
            }

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
                view.parent.getConfiguredOrDefaultResolution(channel, type) ==
                    "shared"
            ) {
                // @ts-ignore
                view = view.parent;
            }

            if (!view.resolutions[type][channel]) {
                view.resolutions[type][channel] =
                    type == "scale"
                        ? new ScaleResolution(channel)
                        : new AxisResolution(channel);
            }

            view.resolutions[type][channel].pushUnitView(this);
        }
    }

    /**
     *
     * @param {string} channel
     * @param {ResolutionType} type
     */
    _getResolution(channel, type) {
        channel = primaryChannel(channel);

        /** @type {import("./view").default } */
        // eslint-disable-next-line consistent-this
        let view = this;
        do {
            if (view.resolutions[type][channel]) {
                return view.resolutions[type][channel];
            }
            view = view.parent;
        } while (view);
    }

    /**
     * @param {string} channel
     */
    getScaleResolution(channel) {
        return /** @type {ScaleResolution} */ (this._getResolution(
            channel,
            "scale"
        ));
    }

    /**
     * @param {string} channel
     */
    getAxisResolution(channel) {
        return /** @type {AxisResolution} */ (this._getResolution(
            channel,
            "axis"
        ));
    }

    /**
     *
     * @param {string} channel
     */
    getAccessor(channel) {
        return getCachedOrCall(this, "accessor-" + channel, () => {
            const encoding = this.mark.encoding; // Mark provides encodings with defaults and possible modifications
            if (encoding && encoding[channel]) {
                return this.context.accessorFactory.createAccessor(
                    encoding[channel]
                );
            }
        });
    }

    /**
     * Returns an accessor that returns a (composite) key for partitioning the data
     *
     * @param {View} [whoIsAsking]
     * @returns {function(object):any}
     */
    getFacetAccessor(whoIsAsking) {
        const sampleAccessor = this.getAccessor("sample");
        if (sampleAccessor) {
            return sampleAccessor;
        }

        return super.getFacetAccessor(this);
    }

    getCollectedData() {
        const collector = this.context.dataFlow.findCollectorByKey(this);
        if (!collector) {
            return undefined;
        }

        return collector.getData();
    }

    /**
     * Returns the domain of the specified channel of this domain/mark.
     *
     * @param {string} channel A primary channel
     * @returns {DomainArray}
     */
    getConfiguredDomain(channel) {
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
    }

    /**
     * Extracts the domain from the data.
     *
     * TODO: Optimize! Now this performs redundant work if multiple views share the same collector.
     *
     * @param {string} channel
     * @returns {DomainArray}
     */
    extractDataDomain(channel) {
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

        /** @param {string} channel */
        const extract = channel => {
            let domain;

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
                        const data = this.getCollectedData() || [];
                        for (const datum of data) {
                            domain.extend(accessor(datum));
                        }
                    }
                }
            }
            return domain;
        };

        let domain = extract(channel);

        const secondaryChannel = secondaryChannels[channel];
        if (secondaryChannel) {
            const secondaryDomain = extract(secondaryChannel);
            if (secondaryDomain) {
                domain.extendAll(secondaryDomain);
            }
        }

        return domain;
    }

    getZoomLevel() {
        /** @param {string} channel */
        const getZoomLevel = channel => {
            // TODO: Replace this with optional chaining (?.) when webpack can handle it
            const resolution = this.getScaleResolution(channel);
            return resolution ? resolution.getZoomLevel() : 1.0;
        };

        return ["x", "y"].map(getZoomLevel).reduce((a, c) => a * c, 1);
    }
}
