import {
    parseSizeDef,
    FlexDimensions,
    ZERO_FLEXDIMENSIONS,
} from "../utils/layout/flexLayout";
import Padding from "../utils/layout/padding";
import {
    getCachedOrCall,
    initPropertyCache,
    invalidatePrefix,
} from "../utils/propertyCacher";
import { isNumber, isString, span } from "vega-util";
import { scaleLog } from "d3-scale";
import { isFieldDef, getPrimaryChannel } from "../encoder/encoder";
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

/** @type {function(number):number} */
const defaultOpacityFunction = (parentOpacity) => parentOpacity;

/**
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
 * @prop {import("../genomeSpy").BroadcastEventType} type Broadcast type
 * @prop {any} [payload] Anything
 *
 * @callback InteractionEventListener
 * @param {import("../utils/layout/rectangle").default} coords
 *      Coordinates of the view
 * @param {import("../utils/interactionEvent").default} event
 */
export default class View {
    /** @type {Record<string, (function(BroadcastMessage):void)[]>} */
    #broadcastHandlers = {};

    /** @type {Record<string, InteractionEventListener[]>} */
    #capturingInteractionEventListeners = {};

    /** @type {Record<string, InteractionEventListener[]>} */
    #nonCapturingInteractionEventListeners = {};

    /**
     * @type {function(number):number}
     */
    opacityFunction = defaultOpacityFunction;

    /**
     *
     * @param {import("../spec/view").ViewSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {import("./containerView").default} layoutParent Parent that handles rendering of this view
     * @param {import("./view").default} dataParent Parent that provides data, encodings, and is used in scale resolution
     * @param {string} name
     */
    constructor(spec, context, layoutParent, dataParent, name) {
        if (!spec) {
            throw new Error("View spec must be defined!");
        }

        this.context = context;
        this.layoutParent = layoutParent;
        this.dataParent = dataParent;
        this.name = spec.name || name;
        this.spec = spec;

        this.resolutions = {
            /**
             * Channel-specific scale resolutions
             * @type {Partial<Record<import("../spec/channel").ChannelWithScale, import("./scaleResolution").default>>}
             */
            scale: {},
            /**
             * Channel-specific axis resolutions
             * @type {Partial<Record<import("../spec/channel").PrimaryPositionalChannel, import("./axisResolution").default>>}
             */
            axis: {},
        };

        initPropertyCache(this);

        /**
         * Don't inherit encodings from parent.
         * TODO: Make configurable through spec. Allow more fine-grained control.
         */
        this.blockEncodingInheritance = false;

        /**
         * Whether ScaleResolution should include this view or its children in the domain.
         * This is mainly used to block axis views from contributing to the domain.
         */
        this.contributesToScaleDomain = true;

        /**
         * Whether GridView or equivalent should draw axis and grid lines for this view.
         * @type {Record<import("../spec/channel").PrimaryPositionalChannel, boolean>}
         */
        this.needsAxes = { x: false, y: false };
    }

    getPadding() {
        return this._cache("size/padding", () =>
            Padding.createFromConfig(this.spec.padding)
        );
    }

    /**
     * Returns a padding that indicates how much axes and titles extend over the plot area.
     *
     * @returns {Padding}
     */
    getOverhang() {
        return Padding.zero();
    }

    /**
     * Returns the configured size, if present. Otherwise a computed or default
     * height is returned.
     *
     * @returns {FlexDimensions}
     */
    getSize() {
        return this._cache("size/size", () =>
            this.isConfiguredVisible()
                ? this.#getSizeFromSpec()
                : ZERO_FLEXDIMENSIONS
        );
    }

    /**
     * @return {FlexDimensions}
     */
    #getSizeFromSpec() {
        /**
         * @param {"width" | "height"} dimension
         * @return {import("../utils/layout/flexLayout").SizeDef}
         */
        const handleSize = (dimension) => {
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

                    // TODO: Type guards maybe?
                    const _scale =
                        /** @type {import("d3-scale").ScaleBand<any> | import("../genome/scaleLocus").ScaleLocus | import("../genome/scaleIndex").ScaleIndex} */ (
                            scale
                        );

                    steps = bandSpace(
                        steps,
                        _scale.paddingInner(),
                        _scale.paddingOuter()
                    );

                    return { px: steps * stepSize, grow: 0 };
                } else {
                    throw new Error(
                        "Cannot use 'step' size with missing scale!"
                    );
                }
            } else {
                return (value && parseSizeDef(value)) ?? { px: 0, grow: 1 };
            }
        };

        return this._cache(
            "size/sizeFromSpec",
            () => new FlexDimensions(handleSize("width"), handleSize("height"))
        );
    }

    isConfiguredVisible() {
        return this.context.isViewConfiguredVisible(this);
    }

    isVisibleInSpec() {
        return this.spec.visible ?? true;
    }

    /**
     * Returns the effective visibility of this view, e.g., whether this view
     * and all its ancestors are visible.
     *
     * When doing a depth-first traversal on the view hierarchy, it's best to
     * use `isConfiguredVisible()` instead of this method.
     *
     * @returns {boolean}
     */
    isVisible() {
        return this.getLayoutAncestors().every((view) =>
            view.isConfiguredVisible()
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
        return this.opacityFunction(
            this.layoutParent?.getEffectiveOpacity() ?? 1.0
        );
    }

    getPathString() {
        return this.getLayoutAncestors()
            .map((v) => v.name)
            .reverse()
            .join("/");
    }

    /**
     * @param {"dataParent" | "layoutParent"} prop
     * @returns {View[]}
     */
    #getAncestors(prop) {
        /** @type {View[]} */
        const ancestors = [];
        // eslint-disable-next-line consistent-this
        let view = /** @type {View} */ (this);
        do {
            ancestors.push(view);
            view = view[prop];
        } while (view);
        return ancestors;
    }

    /**
     * Returns the ancestor views, starting with this view.
     */
    getLayoutAncestors() {
        return this.#getAncestors("layoutParent");
    }

    /**
     * Returns the ancestor views, starting with this view.
     */
    getDataAncestors() {
        return this.#getAncestors("dataParent");
    }

    /**
     * Handles a broadcast message that is intended for the whole view hierarchy.
     *
     * @param {BroadcastMessage} message
     */
    handleBroadcast(message) {
        // TODO: message types should be constants
        for (const handler of this.#broadcastHandlers[message.type] || []) {
            handler(message);
        }
    }

    /**
     *
     * @param {string} type
     * @param {function(BroadcastMessage):void} handler
     */
    _addBroadcastHandler(type, handler) {
        let handlers = this.#broadcastHandlers[type];
        if (!handlers) {
            handlers = [];
            this.#broadcastHandlers[type] = handlers;
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
            ? this.#capturingInteractionEventListeners
            : this.#nonCapturingInteractionEventListeners;
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
            ? this.#capturingInteractionEventListeners
            : this.#nonCapturingInteractionEventListeners;
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
     * Get all descendants of this view in depth-first order.
     */
    getDescendants() {
        /** @type {View[]} */
        const descendants = [];
        this.visit((view) => {
            descendants.push(view);
        });
        return descendants;
    }

    /**
     * Called after all scales in the view hierarchy have been resolved.
     */
    onScalesResolved() {
        // Only set the opacity function once. The idea is to allow custom functions
        // and prevent accidental overwrites.
        if (
            !this.opacityFunction ||
            this.opacityFunction === defaultOpacityFunction
        ) {
            this.opacityFunction = createViewOpacityFunction(this);
        }
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
     * @type {import("../types/rendering").RenderMethod}
     */
    render(context, coords, options = {}) {
        // override
    }

    /**
     * Returns the encodings specified in this view combined with the inherited
     * encodings. However, this does not contain any defaults or inferred/adjusted/fixed
     * encodings. Those are available in Mark's encoding property.
     *
     * @return {import("../spec/channel").Encoding}
     */
    getEncoding() {
        const pe =
            this.dataParent && !this.blockEncodingInheritance
                ? this.dataParent.getEncoding()
                : {};
        const te = this.spec.encoding || {};

        /** @type {import("../spec/channel").Encoding} */
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
        if (this.layoutParent) {
            return this.layoutParent.getFacetAccessor(this);
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
            return this.layoutParent?.getFacetFields(this);
        }
    }

    /**
     * Returns a texture that has a mapping for the sample locations. This is implemented
     * only in the SampleView of GenomeSpy App.
     *
     * Background:
     * There are to ways to manage how sample facets are drawn in the App:
     *
     * 1) Use one draw call for each facet and pass the location data as a uniform.
     * 2) Draw all facets with one call and pass the facet locations as a texture.
     *
     * The former is suitable for large datasets, which can be subsetted for better
     * performance. The latter one is more performant for cases where each facet
     * consists of few data items (sample attributes / metadata).
     *
     * @return {WebGLTexture}
     */
    getSampleFacetTexture() {
        return undefined;
    }

    /**
     * @param {import("../spec/channel").ChannelWithScale} channel
     */
    getScaleResolution(channel) {
        const primaryChannel =
            /** @type {import("../spec/channel").ChannelWithScale} */ (
                getPrimaryChannel(channel)
            );

        return this.getDataAncestors()
            .map((view) => view.resolutions.scale[primaryChannel])
            .find((resolution) => resolution);
    }

    /**
     * @param {import("../spec/channel").PositionalChannel} channel
     */
    getAxisResolution(channel) {
        const primaryChannel =
            /** @type {import("../spec/channel").PrimaryPositionalChannel} */ (
                getPrimaryChannel(channel)
            );

        return this.getDataAncestors()
            .map((view) => view.resolutions.axis[primaryChannel])
            .find((resolution) => resolution);
    }

    /**
     * @param {import("../spec/channel").Channel | "default"} channel
     * @param {import("../spec/view").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getConfiguredResolution(channel, resolutionType) {
        return this.spec.resolve?.[resolutionType]?.[channel];
    }

    /**
     * @param {import("../spec/channel").Channel} channel
     * @param {import("../spec/view").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getConfiguredOrDefaultResolution(channel, resolutionType) {
        return (
            this.getConfiguredResolution(channel, resolutionType) ??
            this.getConfiguredResolution("default", resolutionType) ??
            this.getDefaultResolution(channel, resolutionType)
        );
    }

    /**
     * @param {import("../spec/channel").Channel} channel
     * @param {import("../spec/view").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "independent";
    }

    /**
     * @returns {string}
     */
    getBaseUrl() {
        return appendToBaseUrl(
            () => this.dataParent?.getBaseUrl(),
            this.spec.baseUrl
        );
    }

    /**
     * Returns `true` if this view and its children supports picking.
     */
    isPickingSupported() {
        return true;
    }

    getTitleText() {
        const title = this.spec.title;
        if (title) {
            return isString(title) ? title : title.text;
        }
    }

    /**
     * @param {any} key string
     * @param {function(key?):T} callable A function that produces a value to be cached
     * @returns {T}
     * @template T
     * @protected
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
                for (const view of this.getLayoutAncestors()) {
                    invalidatePrefix(view, key);
                }
                break;
            case "progeny":
                this.visit((view) => invalidatePrefix(view, key));
                break;
            default:
        }
    }

    invalidateSizeCache() {
        this._invalidateCacheByPrefix("size/", "ancestors");
    }

    /**
     * Broadcasts a message to views that include the given (x, y) point.
     * This is mainly intended for mouse events.
     *
     * @param {import("../utils/interactionEvent").default} event
     */
    propagateInteractionEvent(event) {
        // Subclasses must implement proper handling
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
            /** @type {(channel: import("../spec/channel").ChannelWithScale) => any} */
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
