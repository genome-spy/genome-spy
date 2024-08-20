import RectMark from "../marks/rect.js";
import PointMark from "../marks/point.js";
import RuleMark from "../marks/rule.js";
import LinkMark from "../marks/link.js";
import TextMark from "../marks/text.js";

import ScaleResolution from "./scaleResolution.js";
import {
    isPositionalChannel,
    isChannelDefWithScale,
    primaryPositionalChannels,
    getPrimaryChannel,
    isChannelWithScale,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
import createDomain from "../utils/domainArray.js";
import AxisResolution from "./axisResolution.js";
import View from "./view.js";
import {
    createMultiPointSelection,
    createSinglePointSelection,
    isPointSelectionConfig,
    isTogglingEnabledInPointSelectionConfig,
    updateMultiPointSelection,
} from "../selection/selection.js";
import { isString } from "vega-util";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";

/**
 *
 * @type {Record<import("../spec/mark.js").MarkType, typeof import("../marks/mark.js").default>}
 * TODO: Find a proper place, make extendible
 */
export const markTypes = {
    // @ts-ignore TODO: fix
    point: PointMark,
    // @ts-ignore
    rect: RectMark,
    // @ts-ignore
    rule: RuleMark,
    // @ts-ignore
    link: LinkMark,
    // @ts-ignore
    text: TextMark,
};

export default class UnitView extends View {
    /**
     * @typedef {import("../spec/channel.js").Channel} Channel
     * @typedef {import("../utils/domainArray.js").DomainArray} DomainArray
     * @typedef {import("../spec/view.js").ResolutionTarget} ResolutionTarget
     * @typedef {((datum: import("../data/flowNode.js").Datum) => import("../spec/channel.js").Scalar) & { fieldDef: import("../spec/channel.js").FieldDef}} FieldAccessor
     *
     */

    /**
     * Sets the zoom level parameter.
     * @type {(zoomLevel: number) => void}
     */
    #zoomLevelSetter;

    /**
     *
     * @param {import("../spec/view.js").UnitSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, options);

        this.spec = spec; // Set here again to keep types happy

        const Mark = markTypes[this.getMarkType()];
        if (Mark) {
            /** @type {import("../marks/mark.js").default} */
            this.mark = new Mark(this);
        } else {
            throw new Error(`No such mark: ${this.getMarkType()}`);
        }

        this.resolve();

        this.#zoomLevelSetter = this.paramMediator.allocateSetter(
            "zoomLevel",
            1.0
        );
        /** @type {import("../spec/channel.js").ChannelWithScale[]} */ ([
            "x",
            "y",
        ]).forEach((channel) =>
            this.getScaleResolution(channel)?.addEventListener("domain", () =>
                this.#zoomLevelSetter(Math.sqrt(this.getZoomLevel()))
            )
        );

        this.needsAxes = { x: true, y: true };

        this.#setupPointSelection();
    }

    #setupPointSelection() {
        for (const [name, param] of this.paramMediator.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = param.select;
            if (isPointSelectionConfig(select)) {
                // Handle projection-free point selections

                const none = -1;
                let lastId = none;

                const setter = this.paramMediator.getSetter(name);

                const getHoveredDatum = () => {
                    const h = this.context.getCurrentHover();
                    return h?.mark?.unitView === this ? h.datum : null;
                };

                const on =
                    !isString(select) && "on" in select ? select.on : "click";

                this.addInteractionEventListener(
                    ["mouseover", "pointerover"].includes(on)
                        ? "mousemove"
                        : "click",
                    (
                        rect,
                        /** @type {import("../utils/interactionEvent.js").default} */ event
                    ) => {
                        const mouseEvent = /** @type {MouseEvent} */ (
                            event.uiEvent
                        );
                        const datum = getHoveredDatum();
                        const id = datum ? datum[UNIQUE_ID_KEY] : none;

                        if (isTogglingEnabledInPointSelectionConfig(select)) {
                            const toggle = mouseEvent.shiftKey;

                            if (toggle) {
                                if (datum) {
                                    const previousSelection =
                                        this.paramMediator.getValue(name);
                                    setter(
                                        updateMultiPointSelection(
                                            previousSelection,
                                            {
                                                toggle: [datum],
                                            }
                                        )
                                    );
                                }
                            } else {
                                setter(
                                    createMultiPointSelection(
                                        datum ? [datum] : null
                                    )
                                );
                            }
                        } else {
                            if (id != lastId) {
                                lastId = id;
                                const selection =
                                    createSinglePointSelection(datum);
                                setter(selection);
                            }
                        }
                    }
                );
            }
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

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
     * @param {ResolutionTarget} [type] If not specified, both scales and axes are resolved.
     */
    // eslint-disable-next-line complexity
    resolve(type) {
        if (!type) {
            this.resolve("scale");
            this.resolve("axis");
        }

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
                    (view.dataParent &&
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
                view.resolutions[type][targetChannel].addMember({
                    view: this,
                    channel,
                    channelDef,
                });
            } else if (type == "scale" && isChannelWithScale(channel)) {
                if (!view.resolutions[type][targetChannel]) {
                    const resolution = new ScaleResolution(targetChannel);
                    view.resolutions[type][targetChannel] = resolution;

                    resolution.addEventListener("range", (event) => {
                        // Create if WebGLHelper is available, i.e., if not running in headless mode
                        this.context.glHelper?.createRangeTexture(
                            event.scaleResolution,
                            true
                        );
                    });
                }

                const dataDomainSource =
                    this.getLayoutAncestors()
                        // TODO: Should check until the resolved scale resolution
                        .some(
                            (view) => !view.options.contributesToScaleDomain
                        ) ||
                    (isChannelDefWithScale(channelDef) &&
                        channelDef.contributesToScaleDomain === false)
                        ? undefined
                        : this.extractDataDomain.bind(this);

                view.resolutions[type][targetChannel].addMember({
                    view: this,
                    channel,
                    channelDef,
                    dataDomainSource,
                });
            }
        }
    }

    /**
     * Returns an accessor that accesses a field or an evaluated expression,
     * if there is one.
     *
     * @param {Channel} channel
     */
    getDataAccessor(channel) {
        return this.mark.encoders[channel]?.dataAccessor;
    }

    /**
     * Returns an accessor that returns a (composite) key for partitioning the data
     *
     * @param {View} [whoIsAsking]
     * @returns {function(object):any}
     */
    getFacetAccessor(whoIsAsking) {
        // TODO: Rewrite, call getFacetFields
        const sampleAccessor = this.getDataAccessor("sample");
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
     * @param {import("../spec/channel.js").Type} type
     * @returns {DomainArray}
     */
    extractDataDomain(channel, type) {
        /** @type {DomainArray} */
        let domain = createDomain(type);

        (this.mark.encoders[channel]?.accessors ?? [])
            .filter((a) => a.scaleChannel)
            .forEach((accessor) => {
                if (accessor.constant) {
                    domain.extend(accessor({}));
                } else {
                    const collector = this.getCollector();
                    if (collector?.completed) {
                        collector.visitData((d) => domain.extend(accessor(d)));
                    }
                }
            });

        return domain;
    }

    getZoomLevel() {
        /** @param {import("../spec/channel.js").ChannelWithScale} channel */
        const getZoomLevel = (channel) =>
            this.getScaleResolution(channel)?.getZoomLevel() ?? 1.0;

        return primaryPositionalChannels
            .map(getZoomLevel)
            .reduce((a, c) => a * c, 1);
    }

    /**
     * @param {import("../utils/interactionEvent.js").default} event
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
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        // This affects the sample aggregate views.
        return channel == "x" ? "shared" : "independent";
    }
}
