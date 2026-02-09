import {
    parseSizeDef,
    FlexDimensions,
    ZERO_FLEXDIMENSIONS,
} from "./layout/flexLayout.js";
import Padding from "./layout/padding.js";
import {
    getCachedOrCall,
    initPropertyCache,
    invalidatePrefix,
} from "../utils/propertyCacher.js";
import { isNumber, isString, span } from "vega-util";
import { scaleLog } from "d3-scale";
import { isFieldDef, getPrimaryChannel } from "../encoder/encoder.js";
import { concatUrl } from "../utils/url.js";
import { isDiscrete, bandSpace } from "vega-scale";
import { peek } from "../utils/arrayUtils.js";
import ViewError from "./viewError.js";
import ParamMediator from "./paramMediator.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { InternMap } from "internmap";
import { endWithSlash } from "../utils/addBaseUrl.js";

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
 * @prop {import("../genomeSpy.js").BroadcastEventType} type Broadcast type
 * @prop {any} [payload] Anything
 *
 * @callback InteractionEventListener
 * @param {import("./layout/rectangle.js").default} coords
 *      Coordinates of the view
 * @param {import("../utils/interactionEvent.js").default} event
 *
 * @typedef {object} ViewOptions
 * @prop {boolean} [blockEncodingInheritance]
 *      Don't inherit encodings from parent. Default: false.
 * @prop {boolean} [layersChildren]
 *      View's children are layered on top of each other and they have the same
 *      coordinates as their parent.
 */
export default class View {
    /** @type {string | undefined} */
    #defaultName;

    /** @type {Record<string, (function(BroadcastMessage):void)[]>} */
    #broadcastHandlers = {};

    /** @type {Record<string, InteractionEventListener[]>} */
    #capturingInteractionEventListeners = {};

    /** @type {Record<string, InteractionEventListener[]>} */
    #nonCapturingInteractionEventListeners = {};

    /** @type {(value: number) => void} */
    #widthSetter;

    /** @type {(value: number) => void} */
    #heightSetter;

    /** @type {boolean} */
    #hasRendered = false;

    /**
     * @type {function(number):number}
     */
    opacityFunction = defaultOpacityFunction;

    /**
     * @type {(() => void)[]}
     */
    #disposers = [];

    /**
     * @type {"none" | "pending" | "ready"}
     */
    #dataInitializationState = "none";

    /**
     * Coords of the view for each facet, recorded during the last layout rendering pass.
     * Most views have only one facet, so the map is usually of size 1.
     *
     * @type {Map<any, import("./layout/rectangle.js").default>}
     */
    facetCoords = new InternMap([], JSON.stringify);

    /**
     *
     * @param {import("../spec/view.js").ViewSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent Parent that handles rendering of this view
     * @param {import("./view.js").default} dataParent Parent that provides data, encodings, and is used in scale resolution
     * @param {string} name
     * @param {ViewOptions} [options]
     *
     */
    constructor(spec, context, layoutParent, dataParent, name, options = {}) {
        if (!spec) {
            throw new Error("View spec must be defined!");
        }

        this.context = context;
        this.layoutParent = layoutParent;
        this.dataParent = dataParent;
        this.#defaultName = name;
        this.spec = spec;

        this.resolutions = {
            /**
             * Channel-specific scale resolutions
             * @type {Partial<Record<import("../spec/channel.js").ChannelWithScale, import("../scales/scaleResolution.js").default>>}
             */
            scale: {},
            /**
             * Channel-specific axis resolutions
             * @type {Partial<Record<import("../spec/channel.js").PrimaryPositionalChannel, import("../scales/axisResolution.js").default>>}
             */
            axis: {},
        };

        initPropertyCache(this);

        this.options = {
            blockEncodingInheritance: false,
            ...options,
        };

        /**
         * @type {import("../data/flowHandle.js").FlowHandle | undefined}
         */
        this.flowHandle = undefined;

        /**
         * Whether GridView or equivalent should draw axis and grid lines for this view.
         * TODO: Use view options for this.
         * @type {Record<import("../spec/channel.js").PrimaryPositionalChannel, boolean>}
         */
        this.needsAxes = { x: false, y: false };

        /** @type {ParamMediator} */
        this.paramRuntime = new ParamMediator(
            () => this.dataParent?.paramRuntime
        );

        if (spec.params) {
            for (const param of spec.params) {
                // TODO: If interval selection, validate `encodings` or provides defaults
                this.paramRuntime.registerParam(param);
            }
        }

        // All descendants of a layer view have the same coordinates - no need to redefine.
        if (!this.layoutParent?.options.layeredChildren) {
            // Width and height can be overriden by the view spec. Typically it
            // doesn't make much sense, but it's used in the App's SampleView
            // to set the height to sample facets' height.
            const allocateIfFree = (/** @type {string} */ name) =>
                this.paramRuntime.findMediatorForParam(name)
                    ? undefined
                    : this.paramRuntime.allocateSetter(name, 0);
            this.#heightSetter = allocateIfFree("height");
            this.#widthSetter = allocateIfFree("width");
        }
    }

    /**
     * Effective view name. Equals the explicit name (`spec.name`) when provided,
     * otherwise falls back to an auto-generated default name.
     */
    get name() {
        return this.spec.name ?? this.#defaultName;
    }

    /**
     * The explicit name from the spec (`spec.name`), if any.
     */
    get explicitName() {
        return this.spec.name;
    }

    /**
     * The auto-generated default name that was assigned by the parent/factory.
     * Intended for debugging only.
     */
    get defaultName() {
        return this.#defaultName;
    }

    /**
     * Returns the coords of the view. If view has been faceted, returns the coords
     * of an arbitrary facet. If all or specific facet coords are needed, use `facetCoords`.
     *
     * @returns {import("./layout/rectangle.js").default}
     */
    get coords() {
        return this.facetCoords.values().next().value;
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
     * Returns true if the view has explicit viewport size specified and should be
     * scrollable.
     *
     * @returns {boolean}
     */
    isScrollable() {
        return (
            this.spec.viewportWidth != null || this.spec.viewportHeight != null
        );
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
                ? new FlexDimensions(
                      this.#getDimensionSize("width"),
                      this.#getDimensionSize("height")
                  )
                : ZERO_FLEXDIMENSIONS
        );
    }

    /**
     * @returns {FlexDimensions}
     */
    getViewportSize() {
        if (!this.isScrollable()) {
            return this.getSize();
        }

        if (!this.isConfiguredVisible()) {
            return ZERO_FLEXDIMENSIONS;
        }

        const size = this.getSize();

        // TODO: Caching
        return new FlexDimensions(
            this.#getDimensionSize("viewportWidth") ?? size.width,
            this.#getDimensionSize("viewportHeight") ?? size.height
        );
    }

    /**
     * @param {"width" | "height" | "viewportWidth" | "viewportHeight"} dimension
     * @return {import("./layout/flexLayout.js").SizeDef}
     */
    #getDimensionSize(dimension) {
        let value = this.spec[dimension];
        const needsStepInvalidation = isStepSize(value);

        const viewport =
            dimension == "viewportWidth" || dimension == "viewportHeight";

        if (needsStepInvalidation) {
            if (viewport) {
                throw new ViewError(
                    `Cannot use step-based size with "${dimension}"!`,
                    this
                );
            }

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
                    throw new ViewError(
                        `Cannot use step-based size with "${scale.type}" scale!`,
                        this
                    );
                }

                // TODO: Type guards maybe?
                const _scale =
                    /** @type {import("d3-scale").ScaleBand<any> | import("../genome/scaleLocus.js").ScaleLocus | import("../genome/scaleIndex.js").ScaleIndex} */ (
                        scale
                    );

                steps = bandSpace(
                    steps,
                    _scale.paddingInner(),
                    _scale.paddingOuter()
                );

                return { px: steps * stepSize, grow: 0 };
            } else {
                throw new ViewError(
                    `Cannot use step-based size with "${dimension}"!`,
                    this
                );
            }
        } else {
            return (
                (value && parseSizeDef(value)) ??
                (viewport ? undefined : { px: 0, grow: 1 })
            );
        }
    }

    registerStepSizeInvalidation() {
        this.#registerStepSizeInvalidationFor("width", "x");
        this.#registerStepSizeInvalidationFor("height", "y");
    }

    /**
     * @param {"width" | "height"} dimension
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     */
    #registerStepSizeInvalidationFor(dimension, channel) {
        const value = this.spec[dimension];
        if (!isStepSize(value)) {
            return;
        }

        const resolution = this.getScaleResolution(channel);
        if (!resolution) {
            throw new ViewError(
                "Cannot use 'step' size without a scale!",
                this
            );
        }

        const listener = () => this.invalidateSizeCache();
        resolution.addEventListener("domain", listener);
        this.registerDisposer(() =>
            resolution.removeEventListener("domain", listener)
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
     * Returns true if this view or any ancestor is marked as domain inert.
     *
     * @returns {boolean}
     */
    isDomainInert() {
        if (this.spec.domainInert) {
            return true;
        }

        const parent = this.dataParent;
        if (!parent) {
            return false;
        }

        return parent.isDomainInert();
    }

    /**
     * @returns {"none" | "pending" | "ready"}
     */
    getDataInitializationState() {
        return this.#dataInitializationState;
    }

    /**
     * Internal hook for lazy dataflow initialization.
     * Use only from flow initialization helpers to avoid inconsistent state.
     *
     * @param {"none" | "pending" | "ready"} state
     */
    _setDataInitializationState(state) {
        this.#dataInitializationState = state;
    }

    isDataInitialized() {
        return this.#dataInitializationState === "ready";
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
     * @param {import("./layout/rectangle.js").default} coords
     *      Coordinates of the view
     * @param {import("../utils/interactionEvent.js").default} event
     * @param {boolean} capturing
     * @protected
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
     * @param {string} type
     * @param {InteractionEventListener} listener
     * @param {boolean} [useCapture]
     */
    removeInteractionEventListener(type, listener, useCapture) {
        const listenersByType = useCapture
            ? this.#capturingInteractionEventListeners
            : this.#nonCapturingInteractionEventListeners;
        let listeners = listenersByType?.[type];
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index >= 0) {
                listeners.splice(index, 1);
            }
        }
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
     * Get this view and all descendants in depth-first order.
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
     * Release resources owned by this view.
     */
    dispose() {
        for (const disposer of this.#disposers) {
            disposer();
        }
        this.#disposers.length = 0;

        const handle = this.flowHandle;

        if (handle?.collector) {
            this.context.dataFlow.pruneCollectorBranch(handle.collector);
            this.context.dataFlow.removeCollector(handle.collector);
        }

        if (
            handle?.dataSource &&
            handle.dataSource.view === this &&
            !handle.dataSource.identifier
        ) {
            this.context.dataFlow.removeDataSource(handle.dataSource);
        }

        this.context.dataFlow.loadingStatusRegistry.delete(this);

        this.flowHandle = undefined;
    }

    /**
     * @param {() => void} disposer
     */
    registerDisposer(disposer) {
        this.#disposers.push(disposer);
    }

    /**
     * Dispose this view and all descendants in post-order.
     */
    disposeSubtree() {
        /** @type {Visitor} */
        const visitor = () => undefined;
        visitor.postOrder = (view) => {
            view.dispose();
        };
        this.visit(visitor);
    }

    /**
     * Called after all scales in the view hierarchy have been resolved.
     */
    configureViewOpacity() {
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
        if (!this.#hasRendered) {
            this.#hasRendered = true;
        }
    }

    hasRendered() {
        return this.#hasRendered;
    }

    /**
     * Recursively traverses the view hierarchy, computes the view coordinates,
     * and coordinates the mark rendering.
     *
     * @type {import("../types/rendering.js").RenderMethod}
     */
    render(context, coords, options = {}) {
        // TODO: When using sample faceting, all facets have the same coords.
        // It would be better to save only single coords with an `undefined` facetId.
        if (options.firstFacet) {
            this.facetCoords.clear();
        }
        this.facetCoords.set(
            options.facetId,
            options.clipRect ? coords.intersect(options.clipRect) : coords
        );

        this.#widthSetter?.(coords.width);
        this.#heightSetter?.(coords.height);

        // override
    }

    /**
     * Returns the encodings specified in this view combined with the inherited
     * encodings. However, this does not contain any defaults or inferred/adjusted/fixed
     * encodings. Those are available in Mark's encoding property.
     *
     * @return {import("../spec/channel.js").Encoding}
     */
    getEncoding() {
        const pe =
            this.dataParent && !this.options.blockEncodingInheritance
                ? this.dataParent.getEncoding()
                : {};
        const te = this.spec.encoding || {};

        /** @type {import("../spec/channel.js").Encoding} */
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
     * @param {import("../spec/channel.js").ChannelWithScale} channel
     */
    getScaleResolution(channel) {
        const primaryChannel =
            /** @type {import("../spec/channel.js").ChannelWithScale} */ (
                getPrimaryChannel(channel)
            );

        return this.getDataAncestors()
            .map((view) => view.resolutions.scale[primaryChannel])
            .find((resolution) => resolution);
    }

    /**
     * @param {import("../spec/channel.js").PositionalChannel} channel
     */
    getAxisResolution(channel) {
        const primaryChannel =
            /** @type {import("../spec/channel.js").PrimaryPositionalChannel} */ (
                getPrimaryChannel(channel)
            );

        return this.getDataAncestors()
            .map((view) => view.resolutions.axis[primaryChannel])
            .find((resolution) => resolution);
    }

    /**
     * @param {import("../spec/channel.js").Channel | "default"} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getConfiguredResolution(channel, resolutionType) {
        return this.spec.resolve?.[resolutionType]?.[channel];
    }

    /**
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getConfiguredOrDefaultResolution(channel, resolutionType) {
        return (
            this.getConfiguredResolution(channel, resolutionType) ??
            this.getConfiguredResolution("default", resolutionType) ??
            this.getDefaultResolution(channel, resolutionType)
        );
    }

    /**
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "independent";
    }

    /**
     * @returns {string}
     */
    getBaseUrl() {
        return concatUrl(
            () => this.dataParent?.getBaseUrl(),
            endWithSlash(this.spec.baseUrl)
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
            return isString(title)
                ? title
                : isExprRef(title.text)
                  ? this.paramRuntime.evaluateAndGet(title.text.expr)
                  : title.text;
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
        // Clear both "size" and "size/*" cache keys.
        invalidatePrefix(this, "size");
        this._invalidateCacheByPrefix("size", "ancestors");
    }

    /**
     * Broadcasts a message to views that include the given (x, y) point.
     * This is mainly intended for mouse events.
     *
     * @param {import("../utils/interactionEvent.js").default} event
     */
    propagateInteractionEvent(event) {
        // Subclasses must implement proper handling
    }
}

/**
 *
 * @param {any} opacity
 * @returns {opacity is import("../spec/view.js").DynamicOpacity}
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
    const opacityDef = "opacity" in view.spec ? view.spec.opacity : undefined;

    if (opacityDef !== undefined) {
        if (isNumber(opacityDef)) {
            return (parentOpacity) => parentOpacity * opacityDef;
        } else if (isDynamicOpacity(opacityDef)) {
            /** @type {(channel: import("../spec/channel.js").ChannelWithScale) => any} */
            const getScale = (channel) => {
                const scale = view.getScaleResolution(channel)?.getScale();
                // Only works on linear scales
                if (["linear", "index", "locus"].includes(scale?.type)) {
                    return scale;
                }
            };

            const scale = opacityDef.channel
                ? getScale(opacityDef.channel)
                : (getScale("x") ?? getScale("y"));

            if (!scale) {
                throw new ViewError(
                    "Cannot find a resolved quantitative scale for dynamic opacity!",
                    view
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
        } else if (isExprRef(opacityDef)) {
            const fn = view.paramRuntime.createExpression(opacityDef.expr);
            fn.addListener(() => view.context.animator.requestRender());
            return (parentOpacity) => fn(null) * parentOpacity;
        }
    }
    return (parentOpacity) => parentOpacity;
}

/**
 *
 * @param {any} size
 * @return {size is import("../spec/view.js").Step}
 */
export const isStepSize = (size) => !!size?.step;
