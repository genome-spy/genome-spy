import { parseSizeDef, FlexDimensions } from "../utils/layout/flexLayout";
import Padding from "../utils/layout/padding";
import {
    getCachedOrCall,
    initPropertyCache,
    invalidatePrefix,
} from "../utils/propertyCacher";
import { isNumber, span } from "vega-util";
import { scaleLog } from "d3-scale";
import { isFieldDef, primaryChannel } from "../encoder/encoder";
import { appendToBaseUrl } from "../utils/url";
import { isDiscrete, bandSpace } from "vega-scale";
import { peek } from "../utils/arrayUtils";

// TODO: View classes have too many responsibilities. Come up with a way
// to separate the concerns. However, most concerns are tightly tied to
// the hierarchy, which makes the separation quite tricky.
// Separation of concerns would also make the code more easily testable.

/** Skip children */
export const VISIT_SKIP = "VISIT_SKIP";
/** Stop further visits */
export const VISIT_STOP = "VISIT_STOP";

/**
 * @typedef {import("./viewUtils").ViewSpec} ViewSpec
 * @typedef {import("./viewUtils").ChannelDef} ChannelDef
 * @typedef {import("./viewUtils").ViewContext} ViewContext
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
 * @typedef {import("../utils/layout/flexLayout").LocSize} LocSize
 *
 * @typedef {import("../spec/view").ResolutionTarget} ResolutionTarget
 * @typedef {import("./scaleResolution").default} ScaleResolution
 * @typedef {import("./axisResolution").default} AxisResolution
 *
 * @typedef {VISIT_SKIP|VISIT_STOP|void} VisitResult
 *
 * @callback VisitorCallback
 * @param {View} view
 * @returns {VisitResult}
 *
 * @typedef {VisitorCallback & {
 *      postOrder?: function(View):void,
 *      beforeChildren?: function(View):void,
 *      afterChildren?: function(View):void}
 * } Visitor
 *
 * @typedef {object} BroadcastMessage
 * @prop {string} type Broadcast type
 * @prop {any} [payload] Anything
 *
 * @typedef {import("./rendering").RenderingOptions} RenderingOptions
 *
 * @callback InteractionEventListener
 * @param {import("../utils/layout/rectangle").default} coords
 *      Coordinates of the view
 * @param {import("../utils/interactionEvent").default} event
 */
export default class View {
    /**
     *
     * @param {ViewSpec} spec
     * @param {ViewContext} context
     * @param {import("./containerView").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        this.context = context;
        this.parent = parent;
        this.name = spec.name || name;
        this.spec = spec;

        this.resolutions = {
            /**
             * Channel-specific scale resolutions
             * @type {Record<string, import("./scaleResolution").default>}
             */
            scale: {},
            /**
             * Channel-specific axis resolutions
             * @type {Record<string, import("./axisResolution").default>}
             */
            axis: {},
        };

        /** @type {Record<string, (function(BroadcastMessage):void)[]>} */
        this._broadcastHandlers = {};

        /** @type {Record<string, InteractionEventListener[]>} */
        this._capturingInteractionEventListeners = {};
        /** @type {Record<string, InteractionEventListener[]>} */
        this._nonCapturingInteractionEventListeners = {};

        initPropertyCache(this);

        /** @type {function(number):number} */
        this._opacityFunction = (parentOpacity) => parentOpacity;
    }

    getPadding() {
        return this._cache("size/padding", () =>
            Padding.createFromConfig(this.spec.padding)
        );
    }

    /**
     * Returns a computed, "effective" padding between the plot area and view's
     * bounding box. The padding may include the configured padding, axes,
     * peripheral views, etc.
     *
     * Effective padding allows for aligning views so that their content and
     * axes line up properly.
     */
    getEffectivePadding() {
        return this.getPadding();
    }

    /**
     * Returns the configured size, if present. Otherwise a computed or default
     * height is returned.
     *
     * @returns {FlexDimensions}
     */
    getSize() {
        return this._cache("size/size", () =>
            this.getSizeFromSpec().addPadding(this.getPadding())
        );
    }

    /**
     * @return {FlexDimensions}
     */
    getSizeFromSpec() {
        /**
         *
         * @param {"width" | "height"} dimension
         * @return {SizeDef}
         */
        const handleSize = (dimension) => {
            /** @type {SizeDef} */
            let sizeDef;
            let value = this.spec[dimension];

            if (isStepSize(value)) {
                const stepSize = value.step;

                const scale = this.getScaleResolution(
                    dimension == "width" ? "x" : "y"
                )?.getScale();

                if (scale) {
                    // Note: this and all ancestral views need to be refreshed when the domain is changed.
                    let steps = 0;
                    if (isDiscrete(scale.type)) {
                        steps = scale.domain().length;
                    } else if (["locus", "index"].includes(scale.type)) {
                        const domain = scale.domain();
                        steps = peek(domain) - domain[0];
                    } else {
                        throw new Error(
                            `Cannot use step-based size with "${scale.type}" scale!`
                        );
                    }

                    steps = bandSpace(
                        steps,
                        scale.paddingInner(),
                        scale.paddingOuter()
                    );

                    sizeDef = { px: steps * stepSize, grow: 0 };
                } else {
                    throw new Error(
                        "Cannot use 'step' size with missing scale!"
                    );
                }
            } else {
                sizeDef = (value && parseSizeDef(value)) || { px: 0, grow: 1 };
            }
            return sizeDef;
        };

        return this._cache(
            "size/sizeFromSpec",
            () => new FlexDimensions(handleSize("width"), handleSize("height"))
        );
    }

    /**
     * Returns the effective opacity of this view, e.g., view's opacity multiplied
     * by opacities of its ancestors.
     *
     * TODO: This methods makes sense only in Unit and Layer views.
     *
     * @returns {number}
     */
    getEffectiveOpacity() {
        return this._opacityFunction(this.parent?.getEffectiveOpacity() ?? 1.0);
    }

    getPathString() {
        return [...this.getAncestors()]
            .map((v) => v.name)
            .reverse()
            .join("/");
    }

    *getAncestors() {
        // eslint-disable-next-line consistent-this
        let view = /** @type {View} */ (this);
        do {
            yield view;
            view = view.parent;
        } while (view);
    }

    /**
     * Handles a broadcast message that is intended for the whole view hierarchy.
     *
     * @param {BroadcastMessage} message
     */
    handleBroadcast(message) {
        // TODO: message types should be constants
        for (const handler of this._broadcastHandlers[message.type] || []) {
            handler(message);
        }
    }

    /**
     *
     * @param {string} type
     * @param {function(BroadcastMessage):void} handler
     */
    _addBroadcastHandler(type, handler) {
        let handlers = this._broadcastHandlers[type];
        if (!handlers) {
            handlers = [];
            this._broadcastHandlers[type] = handlers;
        }
        handlers.push(handler);
    }

    /**
     * Handles an interactionEvent
     *
     * @param {import("../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../utils/interactionEvent").default} event
     * @param {boolean} capturing
     */
    handleInteractionEvent(coords, event, capturing) {
        const listenersByType = capturing
            ? this._capturingInteractionEventListeners
            : this._nonCapturingInteractionEventListeners;
        for (const listener of listenersByType[event.type] || []) {
            listener(coords, event);
        }
    }

    /**
     * Add an "interaction" event listener that mimics DOM's event model inside
     * the view hierarchy.
     *
     * This is intended for GenomeSpy's internal use. It allows the views to handle
     * low level interactions such as dragging, wheeling, etc.
     *
     * @param {string} type
     * @param {InteractionEventListener} listener
     * @param {boolean} [useCapture]
     */
    addInteractionEventListener(type, listener, useCapture) {
        const listenersByType = useCapture
            ? this._capturingInteractionEventListeners
            : this._nonCapturingInteractionEventListeners;
        let listeners = listenersByType[type];
        if (!listeners) {
            listeners = [];
            listenersByType[type] = listeners;
        }

        listeners.push(listener);
    }

    /**
     * Visits child views in depth-first order. Visitor's return value
     * controls the traversal.
     *
     * @param {Visitor} visitor
     * @returns {VisitResult}
     *
     */
    visit(visitor) {
        try {
            const result = visitor(this);

            if (visitor.postOrder) {
                visitor.postOrder(this);
            }

            if (result !== VISIT_STOP) {
                return result;
            }
        } catch (e) {
            // Augment the exception with the view
            e.view = this;
            throw e;
        }
    }

    /**
     * Called after all scales in the view hierarchy have been resolved.
     */
    onScalesResolved() {
        this._opacityFunction = createViewOpacityFunction(this);
    }

    /**
     * ViewRenderingContext calls this method once for each view during each rendering
     * pass. The order is depth first, pre order.
     */
    onBeforeRender() {
        //
    }

    /**
     * Recursively traverses the view hierarchy, computes the view coordinates,
     * and coordinates the mark rendering.
     *
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords The coordinate rectangle that the parent computed
     *      for the child that is being visited.
     * @param {RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        // override
    }

    /**
     * Returns the encodings specified in this view combined with the inherited
     * encodings. However, this does not contain any defaults or inferred/adjusted/fixed
     * encodings. Those are available in Mark's encoding property.
     *
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     * @return {Object.<string, ChannelDef>}
     */
    getEncoding(whoIsAsking) {
        const pe = this.parent ? this.parent.getEncoding(this) : {};
        const te = this.spec.encoding || {};

        const combined = {
            ...pe,
            ...te,
        };

        for (const [channel, channelDef] of Object.entries(combined)) {
            if (channelDef === null) {
                // Prevent propagation
                delete combined[channel];
            }
        }

        return combined;
    }

    /**
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     * @return {function(object):any}
     */
    getFacetAccessor(whoIsAsking) {
        if (this.parent) {
            return this.parent.getFacetAccessor(this);
        }
    }

    /**
     * Returns the fields that should be used for partitioning the data for facets.
     *
     * @param {View} [whoIsAsking]
     * @returns {string[]}
     */
    getFacetFields(whoIsAsking) {
        const sampleFieldDef = this.getEncoding().sample;
        if (isFieldDef(sampleFieldDef)) {
            return [sampleFieldDef.field];
        } else {
            return this.parent?.getFacetFields(this);
        }
    }

    /**
     *
     * @param {string} channel
     * @param {ResolutionTarget} type
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
        return /** @type {ScaleResolution} */ (
            this._getResolution(channel, "scale")
        );
    }

    /**
     * @param {string} channel
     */
    getAxisResolution(channel) {
        return /** @type {AxisResolution} */ (
            this._getResolution(channel, "axis")
        );
    }

    /**
     * @returns {string}
     */
    getBaseUrl() {
        return appendToBaseUrl(
            () => this.parent?.getBaseUrl(),
            this.spec.baseUrl
        );
    }

    /**
     * @returns {import("../data/sources/dataSource").default}
     */
    getDynamicDataSource() {
        throw new Error("The view does not provide dynamic data!");
    }

    /**
     * @param {any} key string
     * @param {function(key?):T} callable A function that produces a value to be cached
     * @returns {T}
     * @template T
     */
    _cache(key, callable) {
        return getCachedOrCall(this, key, callable);
    }

    /**
     *
     * @param {string} key
     * @param {"self" | "progeny" | "ancestors"} [direction]
     */
    _invalidateCacheByPrefix(key, direction = "self") {
        switch (direction) {
            case "self":
                invalidatePrefix(this, key);
                break;
            case "ancestors":
                for (const view of this.getAncestors()) {
                    invalidatePrefix(view, key);
                }
                break;
            case "progeny":
                this.visit((view) => invalidatePrefix(view, key));
                break;
            default:
        }
    }
}

/**
 *
 * @param {any} opacity
 * @returns {opacity is import("../spec/view").DynamicOpacity}
 */
function isDynamicOpacity(opacity) {
    return "unitsPerPixel" in opacity;
}

/**
 *
 * @param {View} view
 * @returns {function(number):number}
 */
function createViewOpacityFunction(view) {
    const opacityDef = view.spec.opacity;

    if (opacityDef !== undefined) {
        if (isNumber(opacityDef)) {
            return (parentOpacity) => parentOpacity * opacityDef;
        } else if (isDynamicOpacity(opacityDef)) {
            /** @type {function(string):any} */
            const getScale = (channel) => {
                const scale = view.getScaleResolution(channel)?.getScale();
                // Only works on linear scales
                if (["linear", "index", "locus"].includes(scale?.type)) {
                    return scale;
                }
            };

            const scale = opacityDef.channel
                ? getScale(opacityDef.channel)
                : getScale("x") || getScale("y");

            if (!scale) {
                throw new Error(
                    "Cannot find a resolved quantitative scale for dynamic opacity!"
                );
            }

            const interpolate = scaleLog()
                .domain(opacityDef.unitsPerPixel)
                .range(opacityDef.values)
                .clamp(true);

            return (parentOpacity) => {
                const rangeSpan = 1000; //TODO: span(scale.range());
                const unitsPerPixel = span(scale.domain()) / rangeSpan;

                return interpolate(unitsPerPixel) * parentOpacity;
            };
        }
    }
    return (parentOpacity) => parentOpacity;
}

/**
 *
 * @param {any} size
 * @return {size is import("../spec/view").Step}
 */
export const isStepSize = (size) => !!size?.step;
