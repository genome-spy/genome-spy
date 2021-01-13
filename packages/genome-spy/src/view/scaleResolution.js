import {
    isString,
    isNumber,
    panLinear,
    zoomLinear,
    clampRange,
    span
} from "vega-util";
import { isDiscrete, isContinuous } from "vega-scale";

import mergeObjects from "../utils/mergeObjects";
import createScale, { configureScale } from "../scale/scale";

import { expire, getCachedOrCall } from "../utils/propertyCacher";
import {
    getDiscreteRange,
    isColorChannel,
    isDiscreteChannel,
    isPositionalChannel
} from "../encoder/encoder";

export const QUANTITATIVE = "quantitative";
export const ORDINAL = "ordinal";
export const NOMINAL = "nominal";
export const LOCUS = "locus"; // Humdum, should this be "genomic"?

/**
 * Resolution takes care of merging domains and scales from multiple views.
 * This class also provides some utility methods for zooming the scales etc..
 *
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../utils/interval").default} Interval
 * @typedef { import("./unitView").default} UnitView
 */
export default class ScaleResolution {
    /**
     * @param {string} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("./unitView").default[]} The involved views */
        this.views = [];
        /** @type {string} Data type (quantitative, nominal, etc...) */
        this.type = null;

        /** @type {Set<function():void>} Observers that are called when the scale domain is changed */
        this.scaleObservers = new Set();
    }

    /**
     * Adds an observer that is called when the scale domain is changed,
     * e.g., zoomed.
     *
     * @param {function():void} observer function
     */
    addScaleObserver(observer) {
        this.scaleObservers.add(observer);
    }

    /**
     * @param {function():void} observer function
     */
    removeScaleObserver(observer) {
        this.scaleObservers.delete(observer);
    }

    _notifyScaleObservers() {
        for (const observer of this.scaleObservers.values()) {
            observer();
        }
    }

    /**
     * N.B. This is expected to be called in depth-first order
     *
     * @param {UnitView} view
     */
    pushUnitView(view) {
        const type = this._getEncoding(view).type;
        if (!this.type) {
            this.type = type;
        } else if (type !== this.type) {
            // TODO: Include a reference to the layer
            throw new Error(
                `Can not use shared scale for different data types: ${this.type} vs. ${type}. Use "resolve: independent" for channel ${this.channel}`
            );
            // Actually, point scale could be changed into band scale
            // TODO: Use the same merging logic as in: https://github.com/vega/vega-lite/blob/master/src/scale.ts
        }

        this.views.push(view);
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    isExplicitDomain() {
        if (this._explicitDomain) {
            return true;
        }

        for (const view of this.views) {
            const scale = this._getEncoding(view).scale;
            if (scale && Array.isArray(scale.domain)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Collects and merges scale properties from the participating views.
     * Does not include inferred default values such as schemes etc.
     *
     * @returns {import("../spec/scale").Scale}
     */
    getMergedScaleProps() {
        return getCachedOrCall(this, "mergedScaleProps", () => {
            const propArray = this.views.map(
                view => this._getEncoding(view).scale
            );

            // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
            return /** @type { import("../spec/scale").Scale} */ (mergeObjects(
                propArray.filter(props => props !== undefined),
                "scale",
                ["domain"]
            ));
        });
    }

    /**
     * Returns the merged scale properties supplemented with inferred properties
     * and domain.
     *
     * @returns {import("../spec/scale").Scale}
     */
    getScaleProps() {
        return getCachedOrCall(this, "scaleProps", () => {
            const props = {
                ...this._getDefaultScaleProperties(this.type),
                ...this.getMergedScaleProps(),
                ...getLockedScaleProperties(this.channel)
            };

            const domain = this.getDataDomain();
            if (domain && domain.length > 0) {
                props.domain = domain;
            }

            if (!props.type) {
                props.type = getDefaultScaleType(this.channel, this.type);
            }

            // Swap discrete y axis
            if (this.channel == "y" && isDiscrete(props.type)) {
                props.range = [props.range[1], props.range[0]];
            }

            if (props.range && props.scheme) {
                delete props.scheme;
                // TODO: Props should be set more intelligently
                /*
                throw new Error(
                    `Scale has both "range" and "scheme" defined! Views: ${this._getViewPaths()}`
                );
                */
            }

            return props;
        });
    }

    /**
     * Set an explicit domain that overrides all other configurations and
     * computed domains
     *
     * @param {DomainArray} domain
     */
    setDomain(domain) {
        this._explicitDomain = domain;
        if (this._scale) {
            this._scale.domain(domain);
        }
        expire(this, "scaleProps");
    }

    /**
     * Unions the domains (explicit or extracted) of all participating views
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        if (this._explicitDomain) {
            return this._explicitDomain;
        }

        // TODO: Optimize: extract domain only once if the views share the data
        return this.views
            .map(view => view.getDomain(this.channel))
            .filter(domain => !!domain)
            .reduce((acc, curr) => acc.extendAll(curr));
    }

    /**
     * Returns the domain of the scale
     */
    getDomain() {
        return this.getScale()?.domain();
    }

    /**
     * Reconfigures the scale: updates domain and other settings
     */
    reconfigure() {
        if (this._scale) {
            expire(this, "scaleProps");
            configureScale(this.getScaleProps(), this._scale);
            const domain = this.getDataDomain();
            this._originalDomain = [...domain];
        }
    }

    /**
     * @returns {import("../encoder/encoder").VegaScale}
     */
    getScale() {
        if (this._scale) {
            return this._scale;
        }

        const props = this.getScaleProps();

        this._scale = createScale(props);
        if (this._scale.type == "locus") {
            this._configureGenome();
        }

        // Tag the scale and inform encoders and shaders that emulated
        // 64bit floats should be used.
        // N.B. the tag is lost upon scale.clone().
        this._scale.fp64 = !!props.fp64;

        // Can be used as zoom extent
        this._originalDomain = [...this._scale.domain()];

        return this._scale;
    }

    isZoomable() {
        //return isContinuous(this.getScale().type);
        if (this.channel != "x" && this.channel != "y") {
            return false;
        }

        const scaleType = this.getScale().type;
        if (!["linear", "locus", "index"].includes(scaleType)) {
            return false;
        }

        // Check explicit configuration
        const props = this.getScaleProps();
        if ("zoom" in props) {
            return !!props.zoom;
        }

        // By default, index and locus scales are zoomable, others are not
        return ["index", "locus"].includes(scaleType);
    }

    /**
     *
     * @param {number} scaleFactor
     * @param {number} scaleAnchor
     * @param {number} pan
     * @returns {boolean} true if the scale was zoomed
     */
    zoom(scaleFactor, scaleAnchor, pan) {
        if (!this.isZoomable()) {
            return false;
        }

        const scale = this.getScale();
        const oldDomain = scale.domain();
        let newDomain = [...oldDomain];

        // TODO: log, pow, symlog, ...
        newDomain = panLinear(newDomain, pan || 0);
        newDomain = zoomLinear(
            newDomain,
            scale.invert(scaleAnchor),
            scaleFactor
        );

        newDomain = clampRange(newDomain, ...this._originalDomain);

        if ([0, 1].some(i => newDomain[i] != oldDomain[i])) {
            scale.domain(newDomain);
            this._notifyScaleObservers();
            return true;
        }

        return false;
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     *
     * In principle, this is highly specific to positional channels. However, zooming can
     * be generalized to other quantitative channels such as color, opacity, size, etc.
     */
    getZoomLevel() {
        if (this.isZoomable()) {
            return span(this._originalDomain) / span(this.getScale().domain());
        }

        return 1.0;
    }

    /**
     *
     * @param {UnitView} view
     */
    _getEncoding(view) {
        return view.getEncoding()[this.channel];
    }

    /**
     * TODO: These actually depend on the mark, so this is clearly a wrong place.
     * And besides, these should be configurable (themeable)
     *
     * @param {string} dataType
     */
    _getDefaultScaleProperties(dataType) {
        const channel = this.channel;
        const props = {};

        if (this.isExplicitDomain()) {
            props.zero = false;
        }

        if (isPositionalChannel(channel)) {
            props.nice = !this.isExplicitDomain();
        } else if (isColorChannel(channel)) {
            // TODO: Named ranges
            props.scheme =
                dataType == NOMINAL
                    ? "tableau10"
                    : dataType == ORDINAL
                    ? "blues"
                    : "viridis";
        } else if (isDiscreteChannel(channel)) {
            // Shapes of point mark, for example
            props.range = getDiscreteRange(channel);
        } else if (channel == "size") {
            props.range = [0, 400]; // TODO: Configurable default. This is currently optimized for points.
        }

        return props;
    }

    _configureGenome() {
        // Aargh what a hack
        const cm = /** @type {import("../genome/genome").default}*/ (this
            .views[0].context.genomeSpy.coordinateSystem).chromMapper;
        /** @type {import("../genome/scaleLocus").default} */ (this._scale).chromMapper(
            cm
        );
    }

    _getViewPaths() {
        return this.views.map(v => v.getPathString()).join(", ");
    }
}

/**
 *
 * @param {string} channel
 * @param {string} dataType
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if (["index", LOCUS].includes(dataType)) {
        if ("xy".includes(channel)) {
            return dataType;
        } else {
            // TODO: Also explicitly set scales should be validated
            throw new Error(
                `${channel} does not support ${dataType} data type. Only positional channels do.`
            );
        }
    }

    /**
     * @type {Object.<string, string[]>}
     * Default types: nominal, ordinal, quantitative
     */
    const defaults = {
        x: ["band", "band", "linear"],
        y: ["band", "band", "linear"],
        size: [null, "point", "linear"],
        opacity: [null, "point", "linear"],
        color: ["ordinal", "ordinal", "linear"],
        shape: ["ordinal", "ordinal", null],
        squeeze: ["ordinal", "ordinal", null],
        sample: ["identity", "identity", null],
        semanticScore: [null, null, "identity"],
        text: ["identity", "identity", "identity"],
        dx: [null, null, "identity"],
        dy: [null, null, "identity"]
    };

    const type = defaults[channel]
        ? defaults[channel][[NOMINAL, ORDINAL, QUANTITATIVE].indexOf(dataType)]
        : dataType == QUANTITATIVE
        ? "linear"
        : "ordinal";

    if (!type) {
        throw new Error(
            `Channel "${channel}" is not compatible with "${dataType}" data type. Use of a proper scale may be needed.`
        );
    }

    return type;
}

/**
 * Properties that are always overriden
 *
 * @param {string} channel
 */
function getLockedScaleProperties(channel) {
    /** @type {Object.<string, any>} */
    const locked = {
        x: { range: [0, 1] },
        y: { range: [0, 1] }
    };

    return locked[channel] || {};
}
