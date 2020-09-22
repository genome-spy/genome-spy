import { transformData } from "../data/dataMapper";
import { parseSizeDef, FlexDimensions } from "../utils/flexLayout";
import Rectangle from "./rectangle";

/** Skip children */
export const VISIT_SKIP = "VISIT_SKIP";
/** Stop further visits */
export const VISIT_STOP = "VISIT_STOP";

/**
 * @typedef { import("./viewUtils").ViewSpec } ViewSpec
 * @typedef { import("./viewUtils").EncodingConfig } EncodingConfig
 * @typedef { import("./viewUtils").ViewContext} ViewContext
 * @typedef { import("../utils/flexLayout").SizeDef} SizeDef
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

        /* @type {SizeDef} TODO: Replace with size (width & height) */
        //this._height = undefined;

        /** @type {Object.<string, import("./resolution").default>}  Resolved channels. Supports only scales for now.. */
        this.resolutions = {};
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
        );
    }

    /**
     * Returns the coordinates of the view in pixels. The Y coordinate grows from top to bottom.
     *
     * @returns {import("./rectangle").default}
     */
    getCoords() {
        if (this.parent) {
            // Parent computes the coordinates of their children
            return this.parent.getChildCoords(this);
        } else {
            // At root
            const canvasSize = this.context.glHelper.getLogicalCanvasSize();

            /** @param {"width" | "height"} c */
            const getComponent = c =>
                (this.spec[c] && parseSizeDef(this.spec[c]).grow
                    ? canvasSize[c]
                    : this.getSize()[c].px) || canvasSize[c];

            return new Rectangle(
                0,
                0,
                getComponent("width"),
                getComponent("height")
            );
        }
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
     * Visits child views in depth-first order. Terminates the search and returns
     * the value if the visitor returns a defined value.
     *
     * @param {(function(View):("VISIT_SKIP"|"VISIT_STOP"|void)) & { afterChildren?: function}} visitor
     * @returns {any}
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
     * @return {Object.<string, EncodingConfig>}
     */
    getEncoding() {
        const pe = this.parent ? this.parent.getEncoding() : {};
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
