import RectMark from "../marks/rect.js";
import PointMark from "../marks/point.js";
import RuleMark from "../marks/rule.js";
import LinkMark from "../marks/link.js";
import TextMark from "../marks/text.js";

import ScaleResolution from "../scales/scaleResolution.js";
import {
    getEncoderAccessors,
    getEncoderDataAccessor,
    isPositionalChannel,
    isChannelDefWithScale,
    primaryPositionalChannels,
    getPrimaryChannel,
    isChannelWithScale,
    isPrimaryPositionalChannel,
    isValueDefWithCondition,
} from "../encoder/encoder.js";
import { isScaleAccessor } from "../encoder/accessor.js";
import AxisResolution from "../scales/axisResolution.js";
import View from "./view.js";
import {
    asSelectionConfig,
    createMultiPointSelection,
    createSinglePointSelection,
    isPointSelectionConfig,
    updateMultiPointSelection,
} from "../selection/selection.js";
import { getEncodingSearchFields } from "../encoder/metadataChannels.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createEventFilterFunction } from "../utils/expression.js";
import { field } from "../utils/field.js";
import { collectDomainSensitiveScaleChannels } from "../data/flowNode.js";

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
    tick: RuleMark,
    // @ts-ignore
    link: LinkMark,
    // @ts-ignore
    text: TextMark,
};

/**
 * @typedef {object} ResolutionMember
 * @prop {import("./unitView.js").default} view
 * @prop {import("../spec/channel.js").Channel} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 * @prop {import("../spec/channel.js").ChannelWithScale} targetChannel
 */

/**
 * @typedef {Map<import("../scales/scaleResolution.js").default, ResolutionMember[]>} ScaleResolutionMemberMap
 */

/**
 * @param {unknown} channelDef
 * @returns {import("../spec/channel.js").ChannelDefWithScale | undefined}
 */
const getChannelDefWithScale = (channelDef) => {
    if (isChannelDefWithScale(channelDef)) {
        return channelDef;
    }

    if (isValueDefWithCondition(channelDef)) {
        const condition = channelDef.condition;
        if (!Array.isArray(condition) && isChannelDefWithScale(condition)) {
            return condition;
        }
    }

    return undefined;
};

/**
 * @param {import("./unitView.js").default} view
 * @param {import("../spec/view.js").ResolutionTarget} type
 * @param {import("../spec/channel.js").ChannelWithScale} targetChannel
 * @returns {import("./unitView.js").default}
 */
const getResolutionView = (view, type, targetChannel) => {
    let resolutionView = view;
    while (
        (resolutionView.getConfiguredOrDefaultResolution(targetChannel, type) ==
            "forced" ||
            (resolutionView.dataParent &&
                ["shared", "excluded", "forced"].includes(
                    resolutionView.dataParent.getConfiguredOrDefaultResolution(
                        targetChannel,
                        type
                    )
                ))) &&
        resolutionView.getConfiguredOrDefaultResolution(targetChannel, type) !=
            "excluded"
    ) {
        // @ts-ignore
        resolutionView = resolutionView.dataParent;
    }

    return resolutionView;
};

/**
 * @param {import("./unitView.js").default} ownerView
 * @param {import("./unitView.js").default} resolutionView
 * @param {import("../spec/channel.js").ChannelWithScale} targetChannel
 * @returns {import("../scales/scaleResolution.js").default}
 */
const ensureScaleResolution = (ownerView, resolutionView, targetChannel) => {
    if (!resolutionView.resolutions.scale[targetChannel]) {
        const resolution = new ScaleResolution(targetChannel, resolutionView);
        resolutionView.resolutions.scale[targetChannel] = resolution;

        const updateRangeTexture = (
            /** @type {import("../types/scaleResolutionApi.js").ScaleResolutionEvent} */ event
        ) => {
            // Create if WebGLHelper is available, i.e., if not running in headless mode.
            // Domain changes can alter discrete texture sizes as well.
            ownerView.context.glHelper?.createRangeTexture(
                event.scaleResolution,
                true
            );
        };
        resolution.addEventListener("range", updateRangeTexture);
        resolution.addEventListener("domain", updateRangeTexture);
        ownerView.registerDisposer(() => {
            resolution.removeEventListener("range", updateRangeTexture);
            resolution.removeEventListener("domain", updateRangeTexture);
        });
    }

    return resolutionView.resolutions.scale[targetChannel];
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ResolutionTarget} type
 * @param {import("../spec/channel.js").Channel} channel
 * @param {unknown} channelDef
 * @returns {{
 *     view: import("./unitView.js").default,
 *     channel: import("../spec/channel.js").Channel,
 *     channelDef: import("../spec/channel.js").ChannelDefWithScale,
 *     targetChannel: import("../spec/channel.js").ChannelWithScale,
 * } | undefined}
 */
const getResolutionMember = (view, type, channel, channelDef) => {
    const channelDefWithScale = getChannelDefWithScale(channelDef);
    if (!channelDefWithScale) {
        return undefined;
    }

    const targetChannel = getPrimaryChannel(
        channelDefWithScale.resolutionChannel ?? channel
    );
    if (!isChannelWithScale(targetChannel)) {
        return undefined;
    }

    if (type == "axis" && !isPositionalChannel(targetChannel)) {
        return undefined;
    }

    return {
        view: getResolutionView(view, type, targetChannel),
        channel,
        channelDef: channelDefWithScale,
        targetChannel,
    };
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {Array<{
 *     view: import("./unitView.js").default,
 *     channel: import("../spec/channel.js").Channel,
 *     channelDef: import("../spec/channel.js").ChannelDefWithScale,
 *     targetChannel: import("../spec/channel.js").ChannelWithScale,
 * }>}
 */
const collectAxisResolutionMembers = (view) => {
    /** @type {ResolutionMember[]} */
    const axisMembers = [];
    for (const [channel, channelDef] of Object.entries(view.mark.encoding)) {
        if (!channelDef || Array.isArray(channelDef)) {
            continue;
        }

        const member = getResolutionMember(view, "axis", channel, channelDef);
        if (member && isPositionalChannel(member.channel)) {
            axisMembers.push(member);
        }
    }

    return axisMembers;
};

/**
 * @param {import("./unitView.js").default} view
 * @returns {ScaleResolutionMemberMap}
 */
const collectScaleResolutionMembers = (view) => {
    /** @type {ScaleResolutionMemberMap} */
    const scaleMembersByResolution = new Map();

    for (const [channel, channelDef] of Object.entries(view.mark.encoding)) {
        if (!channelDef || Array.isArray(channelDef)) {
            continue;
        }

        const member = getResolutionMember(view, "scale", channel, channelDef);
        if (!member) {
            continue;
        }

        const resolution = ensureScaleResolution(
            view,
            member.view,
            member.targetChannel
        );
        const members = scaleMembersByResolution.get(resolution);
        if (members) {
            members.push(member);
        } else {
            scaleMembersByResolution.set(resolution, [member]);
        }
    }

    return scaleMembersByResolution;
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ResolutionMember[]} axisMembers
 */
const registerAxisResolutionMembers = (view, axisMembers) => {
    for (const {
        view: resolutionView,
        channel,
        channelDef,
        targetChannel,
    } of axisMembers) {
        if (
            !isPositionalChannel(channel) ||
            !isPrimaryPositionalChannel(targetChannel)
        ) {
            continue;
        }

        if (!resolutionView.resolutions.axis[targetChannel]) {
            resolutionView.resolutions.axis[targetChannel] = new AxisResolution(
                targetChannel
            );
        }
        const resolution = resolutionView.resolutions.axis[targetChannel];
        const unregister = resolution.registerMember({
            view,
            channel,
            channelDef,
        });
        view.registerDisposer(() => {
            // Unregister returns true when it removed the last member.
            if (
                unregister() &&
                resolutionView.resolutions.axis[targetChannel] === resolution
            ) {
                delete resolutionView.resolutions.axis[targetChannel];
            }
        });
    }
};

/**
 * @param {import("./unitView.js").default} view
 * @param {ScaleResolutionMemberMap} scaleMembersByResolution
 */
const registerScaleResolutionMembers = (view, scaleMembersByResolution) => {
    ScaleResolution.registerInBatch(scaleMembersByResolution.keys(), () => {
        for (const [resolution, members] of scaleMembersByResolution) {
            for (const {
                view: resolutionView,
                channel,
                channelDef,
                targetChannel,
            } of members) {
                const scaleChannel =
                    /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                        targetChannel
                    );

                const contributesToDomain = !view.isDomainInert();

                const unregister = resolution.registerMember({
                    view,
                    channel:
                        /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                            channel
                        ),
                    channelDef,
                    contributesToDomain,
                });
                view.registerDisposer(() => {
                    // Unregister returns true when it removed the last member.
                    if (
                        unregister() &&
                        resolutionView.resolutions.scale[scaleChannel] ===
                            resolution
                    ) {
                        resolution.dispose();
                        delete resolutionView.resolutions.scale[scaleChannel];
                    }
                });
            }
        }
    });
};

/**
 * @template {import("../spec/view.js").UnitSpec} [TSpec=import("../spec/view.js").UnitSpec]
 * @extends {View<TSpec>}
 */
export default class UnitView extends View {
    /**
     * @typedef {import("../spec/channel.js").Channel} Channel
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
     * @type {boolean}
     */
    #domainSubscriptionsRegistered = false;

    /**
     * @type {import("vega-util").AccessorFn[] | null}
     */
    #searchAccessors = null;

    /**
     *
     * @param {TSpec} spec
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

        this.#zoomLevelSetter = this.paramRuntime.allocateSetter(
            "zoomLevel",
            1.0
        );

        for (const channel of /** @type {import("../spec/channel.js").ChannelWithScale[]} */ ([
            "x",
            "y",
        ])) {
            const resolution = this.getScaleResolution(channel);
            if (resolution) {
                const listener = () => {
                    this.#zoomLevelSetter(Math.sqrt(this.getZoomLevel()));
                };
                resolution.addEventListener("domain", listener);
                this.registerDisposer(() =>
                    resolution.removeEventListener("domain", listener)
                );
            }
        }

        this.registerDisposer(
            this._addBroadcastHandler("subtreeDataReady", () => {
                for (const channel of primaryPositionalChannels) {
                    this.getScaleResolution(
                        channel
                    )?.syncLinkedSelectionFromDomain();
                }
            })
        );

        this.needsAxes = { x: true, y: true };

        this.#setupPointSelection();
    }

    #setupPointSelection() {
        for (const [name, param] of this.paramRuntime.paramConfigs) {
            if (!("select" in param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);
            // Normalized config has eventConfig in "on"
            const eventConfig =
                /** @type {import("../spec/parameter.js").EventConfig} */ (
                    select.on
                );

            const clearEventConfig =
                /** @type {import("../spec/parameter.js").EventConfig} */ (
                    select.clear
                );

            if (isPointSelectionConfig(select)) {
                // Handle projection-free point selections

                const none = 0;
                let lastId = none;

                const setter = (
                    /** @type {any} */
                    selection
                ) => {
                    this.paramRuntime.setValue(name, selection);
                };

                const getHoveredDatum = () => {
                    const h = this.context.getCurrentHover();
                    return h?.mark?.unitView === this ? h.datum : null;
                };

                const eventPredicate = eventConfig.filter
                    ? createEventFilterFunction(eventConfig.filter)
                    : () => true;

                const listener = (
                    /** @type {import("../utils/interaction.js").default} */ event
                ) => {
                    if (!eventPredicate(event.proxiedMouseEvent)) {
                        return;
                    }
                    const datum = getHoveredDatum();
                    const id = datum ? datum[UNIQUE_ID_KEY] : none;

                    /** @type {any} */
                    let selection;

                    if (select.toggle) {
                        const toggle = event.mouseEvent.shiftKey;

                        if (toggle) {
                            if (datum) {
                                const previousSelection =
                                    this.paramRuntime.getValue(name);
                                selection = updateMultiPointSelection(
                                    previousSelection,
                                    {
                                        toggle: [datum],
                                    }
                                );
                            }
                        } else {
                            selection = createMultiPointSelection(
                                datum ? [datum] : null
                            );
                        }
                    } else {
                        if (id != lastId) {
                            lastId = id;
                            selection = createSinglePointSelection(datum);
                        }
                    }

                    if (selection !== undefined) {
                        setter(selection);
                    }
                };

                this.addInteractionListener(
                    ["mouseover", "pointerover"].includes(eventConfig.type)
                        ? "mousemove"
                        : eventConfig.type,
                    listener
                );

                if (clearEventConfig) {
                    const clearPredicate = clearEventConfig.filter
                        ? createEventFilterFunction(clearEventConfig.filter)
                        : () => true;

                    const clearListener = (
                        /** @type {import("../utils/interaction.js").default} */ event
                    ) => {
                        if (!clearPredicate(event.proxiedMouseEvent)) {
                            return;
                        }
                        lastId = none;
                        const selection = select.toggle
                            ? createMultiPointSelection()
                            : createSinglePointSelection(null);
                        setter(selection);
                    };

                    this.addInteractionListener(
                        clearEventConfig.type,
                        clearListener
                    );
                }
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

    getEncoding() {
        // The view may inherit encoding for a channel that is not supported by the mark.
        // Remove them to prevent any odd side effects.
        const encoding = super.getEncoding();
        const supportedChannels = this.mark.getSupportedChannels();
        for (const channel of Object.keys(encoding)) {
            if (channel === "key") {
                continue;
            }

            if (!supportedChannels.includes(channel)) {
                delete encoding[channel];
            }
        }

        return encoding;
    }

    /**
     * Pulls scales and axes up in the view hierarcy according to the resolution rules, using dataParents.
     * TODO: legends
     *
     * @param {ResolutionTarget} [type] If not specified, both scales and axes are resolved.
     */
    resolve(type) {
        if (!type) {
            this.resolve("scale");
            this.resolve("axis");
            return;
        }
        if (type == "axis") {
            registerAxisResolutionMembers(
                this,
                collectAxisResolutionMembers(this)
            );
        } else {
            registerScaleResolutionMembers(
                this,
                collectScaleResolutionMembers(this)
            );
        }
    }

    /**
     * @override
     */
    dispose() {
        super.dispose();
        this.mark.dispose();
    }

    /**
     * Returns an accessor that accesses a field or an evaluated expression,
     * if there is one.
     *
     * @param {Channel} channel
     */
    getDataAccessor(channel) {
        const encoders = this.mark.encoders;
        if (!encoders) {
            return undefined;
        }
        return encoders[channel]
            ? getEncoderDataAccessor(encoders[channel])
            : undefined;
    }

    /**
     * Returns data accessors configured for the `search` channel.
     *
     * @returns {import("vega-util").AccessorFn[]}
     */
    getSearchAccessors() {
        if (!this.#searchAccessors) {
            const fields = getEncodingSearchFields(this.getEncoding()) ?? [];
            this.#searchAccessors = fields.map((fieldName) => field(fieldName));
        }

        return this.#searchAccessors;
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
        return this.flowHandle?.collector;
    }

    /**
     * Registers collector subscriptions that keep scale domains up to date.
     */
    registerDomainSubscriptions() {
        if (this.#domainSubscriptionsRegistered) {
            return;
        }

        if (this.isDomainInert()) {
            return;
        }

        const collector = this.getCollector();
        if (!collector) {
            return;
        }

        const encoders = this.mark.encoders;
        if (!encoders) {
            throw new Error("Encoders are not initialized!");
        }

        this.#domainSubscriptionsRegistered = true;

        const domainDependentChannels =
            collectDomainSensitiveScaleChannels(collector);

        /** @type {Map<import("../scales/scaleResolution.js").default, Set<import("../types/encoder.js").ScaleAccessor>>} */
        const accessorsByResolution = new Map();

        for (const encoder of Object.values(encoders)) {
            if (!encoder) {
                continue;
            }

            const accessors = getEncoderAccessors(encoder);
            if (accessors.length === 0) {
                continue;
            }

            for (const accessor of accessors) {
                if (!isScaleAccessor(accessor)) {
                    continue;
                }
                const resolution = this.getScaleResolution(
                    accessor.scaleChannel
                );
                if (!resolution) {
                    throw new Error(
                        "Missing scale resolution for channel: " +
                            accessor.scaleChannel
                    );
                }
                if (accessor.channelDef.domainInert) {
                    continue;
                }
                if (
                    createsDomainFeedback(
                        accessor,
                        resolution,
                        domainDependentChannels
                    )
                ) {
                    continue;
                }

                let accessorsForResolution =
                    accessorsByResolution.get(resolution);
                if (!accessorsForResolution) {
                    accessorsForResolution = new Set();
                    accessorsByResolution.set(
                        resolution,
                        accessorsForResolution
                    );
                }
                accessorsForResolution.add(accessor);
            }
        }

        for (const [resolution, accessors] of accessorsByResolution) {
            if (accessors.size === 0) {
                continue;
            }
            const unregister = resolution.registerCollectorSubscriptions(
                collector,
                accessors
            );
            this.registerDisposer(unregister);
        }
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
     * @param {import("../utils/interaction.js").default} event
     */
    propagateInteraction(event) {
        this.handleInteraction(event, true);
        event.target = this;

        if (event.stopped) {
            return;
        }

        this.handleInteraction(event, false);
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

/**
 * Returns true when subscribing this accessor as a domain contributor would
 * create a feedback loop: the current scale domain already affects the
 * collector output upstream, so the derived values must not feed back into
 * the same shared-domain resolution.
 *
 * Example: `filterScoredLabels` recomputes visible labels from the current
 * x-domain, so downstream label x positions must not contribute to x-domain.
 *
 * @param {import("../types/encoder.js").ScaleAccessor} accessor
 * @param {import("../scales/scaleResolution.js").default} resolution
 * @param {Set<import("../spec/channel.js").ChannelWithScale>} domainDependentChannels
 * @returns {boolean}
 */
function createsDomainFeedback(accessor, resolution, domainDependentChannels) {
    return (
        !resolution.isDomainDefinedExplicitly() &&
        domainDependentChannels.has(
            /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                getPrimaryChannel(accessor.scaleChannel)
            )
        )
    );
}
