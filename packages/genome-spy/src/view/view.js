import { parseSizeDef, FlexDimensions } from "../utils/layout/flexLayout";
import Rectangle from "../utils/layout/rectangle";
import Padding from "../utils/layout/padding";
import { getCachedOrCall } from "../utils/propertyCacher";
import InlineSource from "../data/sources/inlineSource";
import DynamicCallbackSource from "../data/sources/dynamicCallbackSource";

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
 * @typedef {import("./viewUtils").EncodingConfig} EncodingConfig
 * @typedef {import("./viewUtils").ViewContext} ViewContext
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
 * @typedef {import("../utils/layout/flexLayout").LocSize} LocSize
 *
 *
 * @typedef {object} BroadcastMessage
 * @prop {string} type Broadcast type
 * @prop {any} [payload] Anything
 *
 * @typedef {object} SampleFacetRenderingOptions Describes the location of
 *      a sample facet. Left is the primary pos, right is for transitioning
 *      between two sets of samples.
 * @prop {LocSize} locSize location and height on unit scale
 * @prop {LocSize} [targetLocSize] Target (during transition)
 *
 * @typedef {object} RenderingOptions
 * @prop {any} [facetId] Which facet to render (if faceting is being used)
 * @prop {SampleFacetRenderingOptions} [sampleFacetRenderingOptions]
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
            axis: {}
        };

        /** @type {Record<string, (function(BroadcastMessage):void)[]>} */
        this._broadcastHandlers = {};

        /** @type {Record<string, InteractionEventListener[]>} */
        this._capturingInteractionEventListeners = {};
        /** @type {Record<string, InteractionEventListener[]>} */
        this._nonCapturingInteractionEventListeners = {};
    }

    getPadding() {
        return getCachedOrCall(this, "size/padding", () =>
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
        return getCachedOrCall(this, "size", () =>
            this.getSizeFromSpec().addPadding(this.getPadding())
        );
    }

    getSizeFromSpec() {
        return getCachedOrCall(
            this,
            "size/sizeFromSpec",
            () =>
                new FlexDimensions(
                    (this.spec.width && parseSizeDef(this.spec.width)) || {
                        grow: 1
                    },
                    (this.spec.height && parseSizeDef(this.spec.height)) || {
                        grow: 1
                    }
                )
        );
    }

    getPathString() {
        return this.getAncestors()
            .map(v => v.name)
            .reverse()
            .join("/");
    }

    getAncestors() {
        /** @type {View[]} */
        const views = [];
        // eslint-disable-next-line consistent-this
        let view = /** @type {View} */ (this);
        do {
            views.push(view);
            view = view.parent;
        } while (view);
        return views;
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
     * @param {string} type
     * @param {InteractionEventListener} listener
     * @param {boolean} [useCapture]
     */
    addEventListener(type, listener, useCapture) {
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
     * @param {(function(View):(VISIT_SKIP|VISIT_STOP|void)) & { afterChildren?: function(View):void}} visitor
     * @returns {any}
     *
     * @typedef {"VISIT_SKIP"} VISIT_SKIP Don't visit children of the current node
     * @typedef {"VISIT_STOP"} VISIT_STOP Stop further visits
     */
    visit(visitor) {
        try {
            const result = visitor(this);

            if (visitor.afterChildren) {
                visitor.afterChildren(this);
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
     * ViewRenderingContext calls this method at least once during each rendering
     * pass.
     */
    onBeforeRender() {
        //
    }

    /**
     * Recursively traverses the view hierarchy, computes the view coordinates,
     * and coordinates the mark rendering.
     *
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {Rectangle} coords The coordinate rectangle that the parent computed
     *      for the child that is being visited.
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        // override
    }

    /**
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     * @return {Object.<string, EncodingConfig>}
     */
    getEncoding(whoIsAsking) {
        const pe = this.parent ? this.parent.getEncoding(this) : {};
        const te = this.spec.encoding || {};

        return {
            ...pe,
            ...te
        };
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
     *
     * @param {string} channel
     * @returns {import("./scaleResolution").default}
     */
    getScaleResolution(channel) {
        return (
            this.resolutions.scale[channel] ||
            (this.parent && this.parent.getScaleResolution(channel)) ||
            undefined
        );
    }

    getBaseUrl() {
        /** @type {View} */
        // eslint-disable-next-line consistent-this
        let view = this;
        while (view) {
            if (view.spec.baseUrl) {
                return view.spec.baseUrl;
            }
            view = view.parent;
        }
    }

    /**
     * @returns {Iterable<any>}
     */
    getDynamicData() {
        throw new Error("The view does not provide dynamic data!");
    }

    /**
     * Updates an DynamicSource of this node synchronously, propagates it to children
     * and updates all marks.
     *
     * Currently used for updating axes. A more robust solution is needed
     * for true dynamic data loading.
     */
    updateData() {
        const dataFlow = this.context.dataFlow;
        const dataSource = dataFlow.findDataSourceByKey(this);

        if (dataSource instanceof DynamicCallbackSource) {
            dataSource.loadSynchronously();

            // TODO: The following should be called by a listener attacher to a collector
            this.visit(node => {
                if (node.spec.data && node !== this) {
                    return VISIT_SKIP;
                }
                if (node.mark) {
                    // instanceof complains about circular reference >:(
                    node.mark.initializeData();
                    node.mark.updateGraphicsData();
                }
                // TODO: Update cached domain extents
            });
        } else {
            throw new Error(
                `View ${this.getPathString()} has no associated InlineSource! Cannot update data.`
            );
        }
    }
}
