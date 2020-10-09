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
import createScale from "../scale/scale";

import { SHAPES } from "../marks/pointMark"; // TODO: Fix silly dependency
import { SQUEEZE } from "../marks/rectMark"; // TODO: Fix silly dependency

/**
 * Resolution takes care of merging domains and scales from multiple views.
 * This class also provides some utility methods for zooming the scales etc..
 *
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../utils/interval").default} Interval
 * @typedef { import("./unitView").default} UnitView
 */
export default class Resolution {
    /**
     * @param {string} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("./unitView").default[]} The involved views */
        this.views = [];
        this.scale = {};
        /** @type {string} */
        this.type = null;
    }

    /**
     * @param {string} channel
     * @param {object} scaleConfig
     */
    static createExplicitResolution(channel, scaleConfig) {
        const r = new Resolution(channel);
        r.scale = scaleConfig;
        r._scale = createScale(r.scale);
        return r;
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
        }

        this.views.push(view);

        // TODO: Merge scale
    }

    getAxisProps() {
        const propArray = this.views.map(view => this._getEncoding(view).axis);

        if (propArray.length > 0 && propArray.some(props => props === null)) {
            // No axis whatsoever is wanted
            return null;
        } else {
            return /** @type { import("../spec/axis").Axis} */ (mergeObjects(
                propArray.filter(props => props !== undefined),
                "axis",
                ["title"]
            ));
        }
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    isDomainDefined() {
        if (this._explicitDomain) {
            return true;
        }

        for (const view of this.views) {
            const scale = this._getEncoding(view).scale;
            return scale && Array.isArray(scale.domain);
        }
        return false;
    }

    getScaleProps() {
        const propArray = this.views.map(view => this._getEncoding(view).scale);

        // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
        return /** @type { import("../spec/scale").Scale} */ (mergeObjects(
            propArray.filter(props => props !== undefined),
            "scale",
            ["domain"]
        ));
    }

    getTitle() {
        /** @param {UnitView} view} */
        const computeTitle = view => {
            const encodingSpec = this._getEncoding(view);

            // Retain nulls as they indicate that no title should be shown
            return [
                encodingSpec.axis === null ? null : undefined,
                encodingSpec.axis !== null &&
                typeof encodingSpec.axis === "object"
                    ? encodingSpec.axis.title
                    : undefined,
                encodingSpec.title,
                encodingSpec.field, // TODO: Use accessor.fields instead of encoding.field
                encodingSpec.expr
            ]
                .filter(title => title !== undefined)
                .shift();
        };

        return [...new Set(this.views.map(computeTitle).filter(isString))].join(
            ", "
        );
    }

    /**
     * Set an explicit domain that overrides all other configurations and
     * computed domains
     *
     * @param {DomainArray} domain
     */
    setDomain(domain) {
        this._explicitDomain = domain;
        this._scale = undefined;
    }

    /**
     * Unions the domains of all participating views
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        if (this._explicitDomain) {
            return this._explicitDomain;
        }

        const domains = this.views
            .map(view => view.getDomain(this.channel))
            .filter(domain => !!domain);

        if (domains.length > 1) {
            return domains.reduce((acc, curr) => acc.extendAll(curr));
        } else if (domains.length === 1) {
            return domains[0];
        }

        throw new Error(
            `Cannot resolve domain! Channel: ${
                this.channel
            }, views: ${this.views.map(v => v.getPathString()).join(", ")}`
        );
    }

    /**
     * Returns the domain of the scale
     */
    getDomain() {
        return this.getScale().domain();
    }

    /**
     * @returns {import("../encoder/encoder").VegaScale}
     */
    getScale() {
        if (this._scale) {
            return this._scale;
        }

        const domain = this.getDataDomain();

        if (!domain) {
            return;
        }

        const props = {
            type: getDefaultScaleType(this.channel, domain.type),
            ...this._getDefaultScaleProperties(domain.type),
            ...this.getScaleProps(),
            domain,
            ...getLockedScaleProperties(this.channel)
        };

        // Swap discrete y axis
        if (this.channel == "y" && isDiscrete(props.type)) {
            props.range = [props.range[1], props.range[0]];
        }

        // A hack to remove ambigious color configs. TODO: Something more formal
        if (Array.isArray(props.range)) {
            delete props.scheme;
        }

        this._scale = createScale(props);
        if (this._scale.type == "locus") {
            this._configureGenome();
        }

        // Tag the scale. N.B. the tag is lost upon scale.clone().
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

        if (!["linear", "locus"].includes(this.getScale().type)) {
            return false;
        }

        const props = this.getScaleProps();
        if ("zoom" in props && !props.zoom) {
            return false;
        }

        return true;
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
            return true;
        }

        return false;
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     *
     * TODO: This is highly specific to positional channels. Figure out a better place for this
     * and other zoom-related stuff.
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

        if (this.isDomainDefined()) {
            props.zero = false;
        }

        if (channel == "y" || channel == "x") {
            props.nice = !this.isDomainDefined();
        } else if (channel == "color") {
            // TODO: Named ranges
            props.scheme =
                dataType == "nominal"
                    ? "tableau10"
                    : dataType == "ordinal"
                    ? "blues"
                    : "viridis";
        } else if (channel == "shape") {
            // of point mark
            props.range = Object.keys(SHAPES);
        } else if (channel == "squeeze") {
            // of rect mark
            props.range = Object.keys(SQUEEZE);
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
}

/**
 *
 * @param {string} channel
 * @param {string} dataType
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if (dataType == "locus") {
        if ("xy".includes(channel)) {
            return "locus";
        } else {
            // TODO: Also explicitly set scales should be validated
            throw new Error(
                `${channel} does not support locus data type. Only positional channels do.`
            );
        }
    }

    /** @type {Object.<string, string[]>} [nominal/ordinal, quantitative]*/
    const defaults = {
        x: ["band", "linear"],
        y: ["band", "linear"],
        size: ["point", "linear"],
        opacity: ["point", "linear"],
        color: ["ordinal", "linear"],
        shape: ["ordinal", null], // TODO: Perhaps some discretizing quantitative scale?
        squeeze: ["ordinal", null],
        sample: ["identity", null],
        semanticScore: [null, "identity"],
        text: ["identity", "identity"]
    };

    return defaults[channel]
        ? defaults[channel][dataType == "quantitative" ? 1 : 0]
        : dataType == "quantitative"
        ? "linear"
        : "ordinal";
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
