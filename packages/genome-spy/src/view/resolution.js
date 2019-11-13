import { isString } from "vega-util";

import mergeObjects from "../utils/mergeObjects";
import createScale from "../scale/scale";

import { SHAPES } from "../marks/pointMark"; // TODO: Fix silly dependency

/**
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
        /** @type {import("./unitView").default[]} */
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
        }

        this.views.push(view);

        // TODO: Merge scale
    }

    getAxisProps() {
        const propArray = this.views.map(view => this._getEncoding(view).axis);

        if (propArray.length > 0 && propArray.every(props => props === null)) {
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
                encodingSpec.field // TODO: Use accessor.fields instead of encoding.field
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
    getDomain() {
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

    getScale() {
        if (this._scale) {
            return this._scale;
        }

        const domain = this.getDomain();

        if (!domain) {
            return;
        }

        const props = {
            type: getDefaultScaleType(this.channel, domain.type),
            ...getDefaultScaleProperties(this.channel, domain.type),
            ...this.getScaleProps(),
            domain,
            ...getLockedScaleProperties(this.channel)
        };

        // A hack to remove ambigious color configs. TODO: Something more formal
        if (Array.isArray(props.range)) {
            delete props.scheme;
        }

        this._scale = createScale(props);
        console.log(
            `Channel: ${this.channel}, scale type: ${
                this._scale.type
            }, props: ${JSON.stringify(props)}`
        );
        return this._scale;
    }

    /**
     *
     * @param {UnitView} view
     */
    _getEncoding(view) {
        return view.getEncoding()[this.channel];
    }
}

/**
 *
 * @param {string} channel
 * @param {string} dataType
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    /** @type {Object.<string, string[]>} [nominal/ordinal, quantitative]*/
    const defaults = {
        x: [null, "identity"],
        y: ["band", "linear"],
        size: ["point", "linear"],
        opacity: ["point", "linear"],
        color: ["ordinal", "linear"],
        shape: ["ordinal", null],
        sample: ["identity", null]
    };

    return defaults[channel]
        ? defaults[channel][dataType == "quantitative" ? 1 : 0]
        : dataType == "quantitative"
        ? "linear"
        : "ordinal";
}

/**
 * TODO: These actually depend on the mark, so this is clearly a wrong place
 *
 * @param {string} channel
 * @param {string} dataType
 */
function getDefaultScaleProperties(channel, dataType) {
    const props = {};

    if (channel == "y" || channel == "x") {
        // TODO: Switch to true when all Y-axis labels can be drawn fully visible
        // However, nice should only be true when the domain has not been specified explicitly
        props.nice = false;
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
    } else if (channel == "size") {
        props.range = [0, 400]; // TODO: Configurable default
    }

    return props;
}

/**
 * Properties that are always overriden
 *
 * @param {string} channel
 */
function getLockedScaleProperties(channel) {
    /** @type {Object.<string, any>} */
    const locked = {
        // TODO: x
        y: {
            range: [0, 1]
        }
    };

    return locked[channel] || {};
}

/**
 * @param {import("./view").default} root
 */
export function configureDefaultResolutions(root) {
    if (!root.resolutions.y) {
        root.resolutions.y = Resolution.createExplicitResolution("y", {
            type: "band",
            domain: [undefined],
            range: [0, 1]
        });
        root.resolutions.y.getAxisProps = () => null;
    }
}
