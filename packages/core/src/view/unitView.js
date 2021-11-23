import RectMark from "../marks/rectMark";
import PointMark from "../marks/pointMark";
import RuleMark from "../marks/rule";
import LinkMark from "../marks/link";
import TextMark from "../marks/text";

import ContainerView from "./containerView";
import ScaleResolution from "./scaleResolution";
import {
    isSecondaryChannel,
    secondaryChannels,
    isPositionalChannel,
    isChannelDefWithScale,
    primaryPositionalChannels,
    getPrimaryChannel,
} from "../encoder/encoder";
import createDomain from "../utils/domainArray";
import AxisResolution from "./axisResolution";
import { isAggregateSamplesSpec } from "./viewFactory";

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

/**
 * @typedef {import("../spec/channel").Channel} Channel
 * @typedef {import("./view").default} View
 * @typedef {import("./layerView").default} LayerView
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../encoder/accessor").Accessor} Accessor
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
 * @typedef {import("../spec/view").ResolutionTarget} ResolutionTarget
 * @typedef {import("./decoratorView").default} DecoratorView
 *
 */
export default class UnitView extends ContainerView {
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

        /** @type {(UnitView | LayerView | DecoratorView)[]} */
        this.sampleAggregateViews = [];
        this._initializeAggregateViews();

        /**
         * Not nice! Inconsistent when faceting!
         * TODO: Something. Perhaps a Map that has coords for each facet or something...
         * @type {import("../utils/layout/rectangle").default}
         */
        this.coords = undefined;
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const child of this.sampleAggregateViews) {
            yield child;
        }
    }

    /**
     * @param {View} child
     * @param {View} replacement
     */
    replaceChild(child, replacement) {
        const i = this.sampleAggregateViews.indexOf(child);
        if (i >= 0) {
            this.sampleAggregateViews[i] = replacement;
        } else {
            throw new Error("Not my child view!");
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        if (!this.isVisible()) {
            return;
        }

        coords = coords.shrink(this.getPadding());

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
     * Pulls scales and axes up in the view hierarcy according to the resolution rules.
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

            let targetChannel = getPrimaryChannel(
                channelDef.resolutionChannel ?? channel
            );

            if (type == "axis" && !isPositionalChannel(targetChannel)) {
                continue;
            }

            // eslint-disable-next-line consistent-this
            let view = this;
            while (
                view.parent instanceof ContainerView &&
                ["shared", "excluded"].includes(
                    view.parent.getConfiguredOrDefaultResolution(
                        targetChannel,
                        type
                    )
                ) &&
                view.getConfiguredOrDefaultResolution(targetChannel, type) !=
                    "excluded"
            ) {
                // @ts-ignore
                view = view.parent;
            }

            if (!view.resolutions[type][targetChannel]) {
                view.resolutions[type][targetChannel] =
                    type == "scale"
                        ? new ScaleResolution(targetChannel)
                        : new AxisResolution(targetChannel);
            }

            view.resolutions[type][targetChannel].pushUnitView(this, channel);
        }
    }

    /**
     *
     * @param {import("./view").Channel} channel
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
        if (!isChannelDefWithScale(channelDef)) {
            throw new Error("The channel has no scale, cannot get domain!");
        }

        const type = channelDef.type;
        if (!type) {
            throw new Error(`No data type for channel "${channel}"!`);
            // TODO: Support defaults
        }

        return channelDef;
    }

    /**
     * Returns the domain of the specified channel of this domain/mark.
     *
     * @param {Channel} channel A primary channel
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
                channelDef.type,
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
        const type = channelDef.type;

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
        /** @param {Channel} channel */
        const getZoomLevel = (channel) =>
            this.getScaleResolution(channel)?.getZoomLevel() ?? 1.0;

        return primaryPositionalChannels
            .map(getZoomLevel)
            .reduce((a, c) => a * c, 1);
    }

    _initializeAggregateViews() {
        if (isAggregateSamplesSpec(this.spec)) {
            // TODO: Support multiple
            for (const sumSpec of this.spec.aggregateSamples) {
                sumSpec.transform = [
                    ...(sumSpec.transform ?? []),
                    { type: "mergeFacets" },
                ];

                sumSpec.encoding = {
                    ...(sumSpec.encoding ?? {}),
                    sample: null,
                };

                const summaryView =
                    /** @type { UnitView | LayerView | DecoratorView } */ (
                        this.context.createView(sumSpec, this, "summaryView")
                    );

                /**
                 * @param {View} [whoIsAsking]
                 */
                summaryView.getFacetFields = (whoIsAsking) => undefined;

                this.sampleAggregateViews.push(summaryView);
            }
        }
    }

    /**
     * @param {string} channel
     * @param {import("./containerView").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        // This affects the sample aggregate views.
        return channel == "x" ? "shared" : "independent";
    }
}
