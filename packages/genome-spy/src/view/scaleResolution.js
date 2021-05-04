import {
    panLinear,
    zoomLinear,
    clampRange,
    span,
    panLog,
    zoomLog,
    panPow,
    zoomPow
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
export const INDEX = "index";

/**
 * Resolution takes care of merging domains and scales from multiple views.
 * This class also provides some utility methods for zooming the scales etc..
 *
 * @typedef {import("./unitView").default} UnitView
 * @typedef {import("../encoder/encoder").VegaScale} VegaScale
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
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

        /** @type {Set<function(VegaScale):void>} Observers that are called when the scale domain is changed */
        this.scaleObservers = new Set();
    }

    /**
     * Adds an observer that is called when the scale domain is changed,
     * e.g., zoomed.
     *
     * @param {function(VegaScale):void} observer function
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
            observer(this._scale);
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
        return !!this.getConfiguredDomain();
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
            const mergedProps = this.getMergedScaleProps();
            if (mergedProps === null || mergedProps.type == "null") {
                // No scale (pass-thru)
                // TODO: Check that the channel is compatible
                return { type: "null" };
            }

            const props = {
                ...this._getDefaultScaleProperties(this.type),
                ...mergedProps
            };

            const domain =
                this.getConfiguredDomain() ??
                (this.type == LOCUS
                    ? this.getGenome().getExtent()
                    : this.getDataDomain());

            if (domain && domain.length > 0) {
                props.domain = domain;
            }

            if (!props.domain && props.domainMid !== undefined) {
                // Initialize with a bogus domain so that scale.js can inject the domainMid.
                // The number of domain elements must be know before the glsl scale is generated.
                props.domain = [props.domainMin ?? 0, props.domainMax ?? 1];
            }

            if (!props.type) {
                props.type = getDefaultScaleType(this.channel, this.type);
            }

            if (props.type == LOCUS && !("fp64" in props)) {
                props.fp64 = true;
            }

            // Swap discrete y axis
            if (this.channel == "y" && isDiscrete(props.type)) {
                props.reverse = true;
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

            applyLockedProperties(props, this.channel);

            return props;
        });
    }

    /**
     * Unions the configured domains of all participating views.
     *
     * @return { DomainArray }
     */
    getConfiguredDomain() {
        return this._reduceDomain(view =>
            view.getConfiguredDomain(this.channel)
        );
    }

    /**
     * Extracts and unions the data domains of all participating views.
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        // TODO: Optimize: extract domain only once if the views share the data
        return this._reduceDomain(view => view.extractDataDomain(this.channel));
    }

    /**
     * Reconfigures the scale: updates domain and other settings
     */
    reconfigure() {
        if (this._scale && this._scale.type != "null") {
            expire(this, "scaleProps");
            const props = this.getScaleProps();
            configureScale(props, this._scale);
            if (props.domain) {
                this._originalDomain = this._scale.domain();
            }
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

        const scale = createScale(props);
        this._scale = scale;

        if (scale.type == "locus") {
            scale.genome(this.getGenome());
        }

        // Tag the scale and inform encoders and shaders that emulated
        // 64bit floats should be used.
        // N.B. the tag is lost upon scale.clone().
        scale.fp64 = !!props.fp64;

        // Can be used as zoom extent
        this._originalDomain = scale.domain
            ? [...this._scale.domain()]
            : undefined;

        return scale;
    }

    isZoomable() {
        //return isContinuous(this.getScale().type);
        if (this.channel != "x" && this.channel != "y") {
            return false;
        }

        const scaleType = this.getScale().type;
        if (
            !["linear", "locus", "index", "log", "pow", "sqrt"].includes(
                scaleType
            )
        ) {
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

        const anchor = scale.invert(scaleAnchor);

        if (this.getScaleProps().reverse) {
            pan = -pan;
        }

        // TODO: log, pow, symlog, ...
        switch (scale.type) {
            case "linear":
            case "index":
            case "locus":
                newDomain = panLinear(newDomain, pan || 0);
                newDomain = zoomLinear(newDomain, anchor, scaleFactor);
                break;
            case "log":
                newDomain = panLog(newDomain, pan || 0);
                newDomain = zoomLog(newDomain, anchor, scaleFactor);
                break;
            case "pow":
            case "sqrt":
                newDomain = panPow(newDomain, pan || 0, scale.exponent());
                newDomain = zoomPow(
                    newDomain,
                    anchor,
                    scaleFactor,
                    scale.exponent()
                );
                break;
            default:
                throw new Error("Unsupported scale type: " + scale.type);
        }

        newDomain = clampRange(newDomain, ...this._originalDomain);

        if ([0, 1].some(i => newDomain[i] != oldDomain[i])) {
            scale.domain(newDomain);
            this._notifyScaleObservers();
            return true;
        }

        return false;
    }

    /**
     *
     * @param {number[]} interval
     */
    zoomTo(interval) {
        if (!this.isZoomable()) {
            throw new Error("Not a zoomable scale!");
        }

        this.getScale().domain(interval);
        this._notifyScaleObservers();
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
        return view.mark.encoding[this.channel];
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

    getGenome() {
        if (this.type !== "locus") {
            return undefined;
        }

        // TODO: Support multiple assemblies
        return this.views[0].context.genomeStore.getGenome();
    }

    _getViewPaths() {
        return this.views.map(v => v.getPathString()).join(", ");
    }

    /**
     * @param {function(UnitView):DomainArray} domainAccessor
     * @returns {DomainArray}
     */
    _reduceDomain(domainAccessor) {
        const domains = this.views
            .map(domainAccessor)
            .filter(domain => !!domain);

        if (domains.length) {
            return domains.reduce((acc, curr) => acc.extendAll(curr));
        }
    }
}

/**
 *
 * @param {string} channel
 * @param {string} dataType
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if ([INDEX, LOCUS].includes(dataType)) {
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
     * Default types: nominal, ordinal, quantitative.
     * undefined = incompatible, "null" = disabled (pass-thru)
     */
    const defaults = {
        uniqueId: ["null", undefined, undefined],
        facetIndex: ["null", undefined, undefined],
        x: ["band", "band", "linear"],
        y: ["band", "band", "linear"],
        size: [undefined, "point", "linear"],
        opacity: [undefined, "point", "linear"],
        color: ["ordinal", "ordinal", "linear"],
        shape: ["ordinal", "ordinal", undefined],
        squeeze: ["ordinal", "ordinal", undefined],
        sample: ["null", "null", undefined],
        semanticScore: [undefined, undefined, "null"],
        search: ["null", undefined, undefined],
        text: ["null", "null", "null"],
        dx: [undefined, undefined, "null"],
        dy: [undefined, undefined, "null"]
    };

    const type = defaults[channel]
        ? defaults[channel][[NOMINAL, ORDINAL, QUANTITATIVE].indexOf(dataType)]
        : dataType == QUANTITATIVE
        ? "linear"
        : "ordinal";

    if (type === undefined) {
        throw new Error(
            `Channel "${channel}" is not compatible with "${dataType}" data type. Use of a proper scale may be needed.`
        );
    }

    return type;
}

/**
 * @param {import("../spec/scale").Scale} props
 * @param {string} channel
 */
function applyLockedProperties(props, channel) {
    if (isPositionalChannel(channel)) {
        props.range = [0, 1];
    }

    if (channel == "opacity") {
        if (isContinuous(props.type)) {
            props.clamp = true;
        }
    }
}
