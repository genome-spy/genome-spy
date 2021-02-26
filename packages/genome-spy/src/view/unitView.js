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
    isPositionalChannel,
    isChannelDefWithScale
} from "../encoder/encoder";
import createDomain from "../utils/domainArray";
import { getCachedOrCall } from "../utils/propertyCacher";
import AxisResolution from "./axisResolution";
import { getViewClass, isSummarizeSamplesSpec } from "./viewUtils";

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
        this.sampleSummaryViews = [];
        this._initializeSummaryViews();

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
        for (const child of this.sampleSummaryViews) {
            yield child;
        }
    }

    /**
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        const i = this.sampleSummaryViews.indexOf(child);
        if (i >= 0) {
            this.sampleSummaryViews[i] = replacement;
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
        coords = coords.shrink(this.getPadding());

        if (this.name == "amplification") {
            console.log(this.getCollector());
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
     * Pulls scales and axes up in the view hierarcy according to the resolution rules.
     * TODO: legends
     *
     * @param {ResolutionType} type
     */
    resolve(type) {
        // TODO: Complain about nonsensical configuration, e.g. shared parent has independent children.

        for (const [channel, channelDef] of Object.entries(
            this.getEncoding()
        )) {
            if (type == "axis" && !isPositionalChannel(channel)) {
                continue;
            }

            if (isSecondaryChannel(channel)) {
                // TODO: Secondary channels should be pulled up as "primarys".
                // Example: The titles of both y and y2 should be shown on the y axis
                continue;
            }

            if (!isChannelDefWithScale(channelDef)) {
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
     * @param {string} channel A primary channel
     */
    _validateDomainQuery(channel) {
        if (isSecondaryChannel(channel)) {
            throw new Error(
                `getDomain(${channel}), must only be called for primary channels!`
            );
        }

        const channelDef = this.getEncoding()[channel];
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
     * @param {string} channel A primary channel
     * @returns {DomainArray}
     */
    getConfiguredDomain(channel) {
        const channelDef = this._validateDomainQuery(channel);

        const specDomain =
            channelDef && channelDef.scale && channelDef.scale.domain;
        if (specDomain) {
            return createDomain(channelDef.type, specDomain);
        }
    }

    /**
     * Extracts the domain from the data.
     *
     * TODO: Optimize! Now this performs redundant work if multiple views share the same collector.
     * Also, all relevant fields should be processed in one iteration: https://jsbench.me/y5kkqy52jo/1
     *
     * @param {string} channel
     * @returns {DomainArray}
     */
    extractDataDomain(channel) {
        const channelDef = this._validateDomainQuery(channel);
        const type = channelDef.type;

        /** @param {string} channel */
        const extract = channel => {
            /** @type {DomainArray} */
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
                        const collector = this.getCollector();
                        if (collector?.completed) {
                            collector.visitData(d =>
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
        /** @param {string} channel */
        const getZoomLevel = channel => {
            // TODO: Replace this with optional chaining (?.) when webpack can handle it
            const resolution = this.getScaleResolution(channel);
            return resolution ? resolution.getZoomLevel() : 1.0;
        };

        return ["x", "y"].map(getZoomLevel).reduce((a, c) => a * c, 1);
    }

    _initializeSummaryViews() {
        if (isSummarizeSamplesSpec(this.spec)) {
            // TODO: Support multiple
            const sumSpec = this.spec.summarizeSamples;

            sumSpec.transform = [
                ...(sumSpec.transform ?? []),
                { type: "mergeFacets" }
            ];

            sumSpec.encoding = {
                ...(sumSpec.encoding ?? {}),
                sample: null
            };

            const View = getViewClass(sumSpec);
            const summaryView = /** @type { UnitView | LayerView | DecoratorView } */ (new View(
                sumSpec,
                this.context,
                this,
                "summaryView"
            ));

            /**
             * @param {View} [whoIsAsking]
             */
            summaryView.getFacetFields = whoIsAsking => undefined;

            this.sampleSummaryViews.push(summaryView);
        }
    }
}
