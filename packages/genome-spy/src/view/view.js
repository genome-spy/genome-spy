import { transformData } from "../data/dataMapper";
import { parseSizeDef, FlexDimensions } from "../utils/layout/flexLayout";
import Rectangle from "../utils/layout/rectangle";
import Padding from "../utils/layout/padding";
import { DataGroup } from "../data/group";

/** Skip children */
export const VISIT_SKIP = "VISIT_SKIP";
/** Stop further visits */
export const VISIT_STOP = "VISIT_STOP";

/**
 * @typedef { import("./viewUtils").ViewSpec } ViewSpec
 * @typedef { import("./viewUtils").EncodingConfig } EncodingConfig
 * @typedef { import("./viewUtils").ViewContext} ViewContext
 * @typedef { import("../utils/layout/flexLayout").SizeDef} SizeDef
 *
 * @typedef {object} BroadcastMessage
 * @prop {string} type Broadcast type
 * @prop {any} [payload] Anything
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

        /** @type {Object.<string, import("./resolution").default>}  Resolved channels. Supports only scales for now.. */
        this.resolutions = {};

        /** @type {Record<string, (function(BroadcastMessage):void)[]>} */
        this._broadcastHandlers = {};

        this._addBroadcastHandler("layout", () => {
            // Clear memoized coordinates
            this._coords = undefined;
        });
    }

    getPadding() {
        return Padding.createFromConfig(this.spec.padding);
    }

    /**
     * Returns the configured height if present. Otherwise a computed or default
     * height is returned.
     *
     * @returns {FlexDimensions}
     */
    getSize() {
        // TODO: reconsider the default
        return new FlexDimensions(
            (this.spec.width && parseSizeDef(this.spec.width)) || { grow: 1 },
            (this.spec.height && parseSizeDef(this.spec.height)) || { grow: 1 }
        ).addPadding(this.getPadding());
    }

    /**
     * Returns the coordinates of the view in pixels. The Y coordinate grows from top to bottom.
     *
     * @returns {import("../utils/layout/rectangle").default}
     */
    getCoords() {
        if (this._coords) {
            return this._coords;
        }

        if (this.parent) {
            // Parent computes the coordinates of their children
            this._coords = this.parent
                .getChildCoords(this)
                .shrink(this.getPadding());
        } else {
            // At root
            const canvasSize = this.context.glHelper.getLogicalCanvasSize();

            /** @param {"width" | "height"} c */
            const getComponent = c =>
                (this.spec[c] && parseSizeDef(this.spec[c]).grow
                    ? canvasSize[c]
                    : this.getSize()[c].px) || canvasSize[c];

            this._coords = new Rectangle(
                0,
                0,
                getComponent("width"),
                getComponent("height")
            ).shrink(this.getPadding());
        }

        return this._coords;
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
     * Visits child views in depth-first order. Terminates the search and returns
     * the value if the visitor returns a defined value.
     *
     * @param {(function(View):(VISIT_SKIP|VISIT_STOP|void)) & { afterChildren?: function}} visitor
     * @returns {any}
     *
     * @typedef {"VISIT_SKIP"} VISIT_SKIP Don't visit children of the current node
     * @typedef {"VISIT_STOP"} VISIT_STOP Stop further visits
     */
    visit(visitor) {
        try {
            const result = visitor(this);
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
     *
     * @param {string} channel
     * @returns {import("./resolution").default}
     */
    getResolution(channel) {
        return (
            this.resolutions[channel] ||
            (this.parent && this.parent.getResolution(channel)) ||
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
     * @returns {import("../data/group").Group}
     */
    getData() {
        // TODO: Redesign and replace with a more sophisticated data flow

        if (this.data) {
            return this.data;
        }

        if (this.parent) {
            return this.parent.getData();
        }

        throw new Error(`No data are available!`);
    }

    /**
     * Updates data of this node synchronously, propagates it to children
     * and updates all marks.
     *
     * Currently used for updating axes. A more robust solution is needed
     * for true dynamic data loading.
     *
     * @param {any[]} data
     */
    updateData(data) {
        this.data = new DataGroup("immediate", data);

        this.visit(node => {
            if (node.spec.data && node !== this) {
                return VISIT_SKIP;
            }
            node.transformData();
            if (node.mark) {
                // instanceof complains about circular reference >:(
                node.mark.initializeData();
                node.mark.updateGraphicsData();
            }
            // TODO: Update cached domain extents
        });
    }

    async loadData() {
        if (this.spec.data) {
            this.data = await this.context
                .getDataSource(this.spec.data, this.getBaseUrl())
                .getData();
        }
    }

    /**
     * Must be called in depth-first order
     */
    transformData() {
        if (this.spec.transform) {
            this.data = transformData(this.spec.transform, this.getData());
        }
    }
}
