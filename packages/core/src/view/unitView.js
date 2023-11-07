import RectMark from "../marks/rectMark.js";
import PointMark from "../marks/pointMark.js";
import RuleMark from "../marks/rule.js";
import LinkMark from "../marks/link.js";
import TextMark from "../marks/text.js";

import ContainerView from "./containerView.js";
import ScaleResolution from "./scaleResolution.js";
import {
    isSecondaryChannel,
    secondaryChannels,
    isPositionalChannel,
    isChannelDefWithScale,
    primaryPositionalChannels,
    getPrimaryChannel,
    isChannelWithScale,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
import createDomain from "../utils/domainArray.js";
import AxisResolution from "./axisResolution.js";

/**
 *
 * @type {Object.<string, typeof import("../marks/mark").default>}
 * TODO: Find a proper place, make extendible
 */
export const markTypes = {
    point: PointMark,
    rect: RectMark,
    rule: RuleMark,
    link: LinkMark,
    text: TextMark,
};

export default class UnitView extends ContainerView {
    /**
     * @typedef {import("../spec/channel").Channel} Channel
     * @typedef {import("./view").default} View
     * @typedef {import("./layerView").default} LayerView
     * @typedef {import("../utils/domainArray").DomainArray} DomainArray
     * @typedef {import("../spec/view").ResolutionTarget} ResolutionTarget
     *
     */
    /**
     *
     * @param {import("../spec/view").UnitSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {import("./containerView").default} layoutParent
     * @param {import("./view").default} dataParent
     * @param {string} name
     */
    constructor(spec, context, layoutParent, dataParent, name) {
        super(spec, context, layoutParent, dataParent, name);

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
         * TODO: Something. Maybe store only width/height
         * @type {import("../utils/layout/rectangle").default}
         */
        this.coords = undefined;

        this.needsAxes = { x: true, y: true };
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("../types/rendering").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        if (!this.isConfiguredVisible()) {
            return;
        }

        this.coords = coords;

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
     * Pulls scales and axes up in the view hierarcy according to the resolution rules, using dataParents.
     * TODO: legends
     *
     * @param {ResolutionTarget} type
     */
    resolve(type) {
        // TODO: Complain about nonsensical configuration, e.g. shared parent has independent children.

        const encoding = this.mark.encoding;

        for (const [channel, channelDef] of Object.entries(encoding)) {
            if (!isChannelDefWithScale(channelDef)) {
                continue;
            }

            const targetChannel = getPrimaryChannel(
                channelDef.resolutionChannel ?? channel
            );

            if (!isChannelWithScale(targetChannel)) {
                continue;
            }

            if (type == "axis" && !isPositionalChannel(targetChannel)) {
                continue;
            }

            // eslint-disable-next-line consistent-this
            let view = this;
            while (
                (view.getConfiguredOrDefaultResolution(targetChannel, type) ==
                    "forced" ||
                    (view.dataParent instanceof ContainerView &&
                        ["shared", "excluded", "forced"].includes(
                            view.dataParent.getConfiguredOrDefaultResolution(
                                targetChannel,
                                type
                            )
                        ))) &&
                view.getConfiguredOrDefaultResolution(targetChannel, type) !=
                    "excluded"
            ) {
                // @ts-ignore
                view = view.dataParent;
            }

            // Quite a bit of redundancy, but makes type checker happy.
            if (
                type == "axis" &&
                isPositionalChannel(channel) &&
                isPrimaryPositionalChannel(targetChannel)
            ) {
                if (!view.resolutions[type][targetChannel]) {
                    view.resolutions[type][targetChannel] = new AxisResolution(
                        targetChannel
                    );
                }
                view.resolutions[type][targetChannel].pushUnitView(
                    this,
                    channel
                );
            } else if (type == "scale" && isChannelWithScale(channel)) {
                if (!view.resolutions[type][targetChannel]) {
                    view.resolutions[type][targetChannel] = new ScaleResolution(
                        targetChannel
                    );
                }
                view.resolutions[type][targetChannel].pushUnitView(
                    this,
                    channel
                );
            }
        }
    }

    /**
     *
     * @param {Channel} channel
     */
    getAccessor(channel) {
        return this._cache("accessor/" + channel, () => {
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
        // TODO: Rewrite, call getFacetFields
        const sampleAccessor = this.getAccessor("sample");
        if (sampleAccessor) {
            return sampleAccessor;
        }

        return super.getFacetAccessor(this);
    }

    /**
     * Returns a collector that is associated with this view.
     */
    getCollector() {
        return this.context.dataFlow.findCollectorByKey(this);
    }

    /**
     * @param {Channel} channel A primary channel
     */
    _validateDomainQuery(channel) {
        if (isSecondaryChannel(channel)) {
            throw new Error(
                `getDomain(${channel}), must only be called for primary channels!`
            );
        }

        const channelDef = this.mark.encoding[channel];
        // TODO: Broken. Fix.
        if (!isChannelDefWithScale(channelDef)) {
            throw new Error("The channel has no scale, cannot get domain!");
        }

        return channelDef;
    }

    /**
     * Returns the domain of the specified channel of this domain/mark.
     *
     * @param {import("../spec/channel").ChannelWithScale} channel A primary channel
     * @returns {DomainArray}
     */
    getConfiguredDomain(channel) {
        const channelDef = this._validateDomainQuery(channel);

        const specDomain =
            channelDef && channelDef.scale && channelDef.scale.domain;
        if (specDomain) {
            const scaleResolution = this.getScaleResolution(
                channelDef.resolutionChannel ?? channel
            );
            return createDomain(
                channelDef.type ?? "nominal",
                // Chrom/pos must be linearized first
                scaleResolution.fromComplexInterval(specDomain)
            );
        }
    }

    /**
     * Extracts the domain from the data.
     *
     * TODO: Optimize! Now this performs redundant work if multiple views share the same collector.
     * Also, all relevant fields should be processed in one iteration: https://jsbench.me/y5kkqy52jo/1
     * In fact, domain extraction could be a responsibility of the collector: As it handles data items,
     * it extracts domains for all fields (and data types) that need extracted domains.
     * Alternatively, extractor nodes could be added to the data flow, just like Vega does
     * (with aggregate and extent).
     *
     * @param {Channel} channel
     * @returns {DomainArray}
     */
    extractDataDomain(channel) {
        const channelDef = this._validateDomainQuery(channel);
        const type = channelDef.type ?? "nominal"; // TODO: Should check that this is a channel without scale

        /** @param {Channel} channel */
        const extract = (channel) => {
            /** @type {DomainArray} */
            let domain;

            const encodingSpec = this.mark.encoding[channel];

            if (encodingSpec) {
                const accessor =
                    this.context.accessorFactory.createAccessor(encodingSpec);
                if (accessor) {
                    domain = createDomain(type);

                    if (accessor.constant) {
                        domain.extend(accessor({}));
                    } else {
                        const collector = this.getCollector();
                        if (collector?.completed) {
                            collector.visitData((d) =>
                                domain.extend(accessor(d))
                            );
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
        /** @param {import("../spec/channel").ChannelWithScale} channel */
        const getZoomLevel = (channel) =>
            this.getScaleResolution(channel)?.getZoomLevel() ?? 1.0;

        return primaryPositionalChannels
            .map(getZoomLevel)
            .reduce((a, c) => a * c, 1);
    }

    /**
     * @param {import("../utils/interactionEvent").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);
        event.target = this;

        if (event.stopped) {
            return;
        }

        this.handleInteractionEvent(undefined, event, false);
    }

    /**
     * @param {string} channel
     * @param {ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        // This affects the sample aggregate views.
        return channel == "x" ? "shared" : "independent";
    }
}
