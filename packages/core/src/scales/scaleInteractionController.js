import {
    clampRange,
    isArray,
    isBoolean,
    isObject,
    panLinear,
    panLog,
    panPow,
    span,
} from "vega-util";
import { isContinuous, isDiscrete } from "vega-scale";

import { shallowArrayEquals } from "../utils/arrayUtils.js";
import { zoomDomainByScaleType } from "./zoomDomainUtils.js";
import { toInternalIndexLikeInterval } from "./indexLikeDomainUtils.js";
import {
    hasExplicitLocusUpperBound,
    isChromosomalLocusInterval,
} from "../genome/genome.js";

/**
 * @typedef {import("../spec/scale.js").NumericDomain} NumericDomain
 * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
 * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale.js").ZoomParams} ZoomParams
 * @typedef {import("../types/encoder.js").VegaScale} VegaScale
 * @typedef {import("../types/scaleResolutionApi.js").ZoomToOptions} ZoomToOptions
 * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
 */

export default class ScaleInteractionController {
    /** @type {() => ScaleWithProps} */
    #getScale;

    /** @type {(domain: number[], duration: number, renderImmediately?: boolean) => Promise<void>} */
    #navigate;

    /** @type {() => void} */
    #renderImmediately;

    /** @type {() => number[]} */
    #getInitialDomainSnapshot;

    /** @type {() => number[] | undefined} */
    #getDataZoomExtent;

    /** @type {() => number[]} */
    #getResetDomain;

    /** @type {(domain: ScalarDomain | ComplexDomain) => number[]} */
    #fromComplexInterval;

    /** @type {() => number[]} */
    #getGenomeExtent;

    /**
     * @param {object} options
     * @param {() => ScaleWithProps} options.getScale
     * @param {(domain: number[], duration: number, renderImmediately?: boolean) => Promise<void>} options.navigate
     * @param {() => void} options.renderImmediately
     * @param {() => number[]} options.getInitialDomainSnapshot
     * @param {() => number[] | undefined} options.getDataZoomExtent
     * @param {() => number[]} options.getResetDomain
     * @param {(domain: ScalarDomain | ComplexDomain) => number[]} options.fromComplexInterval
     * @param {() => number[]} options.getGenomeExtent
     */
    constructor({
        getScale,
        navigate,
        renderImmediately,
        getInitialDomainSnapshot,
        getDataZoomExtent,
        getResetDomain,
        fromComplexInterval,
        getGenomeExtent,
    }) {
        this.#getScale = getScale;
        this.#navigate = navigate;
        this.#renderImmediately = renderImmediately;
        this.#getInitialDomainSnapshot = getInitialDomainSnapshot;
        this.#getDataZoomExtent = getDataZoomExtent;
        this.#getResetDomain = getResetDomain;
        this.#fromComplexInterval = fromComplexInterval;
        this.#getGenomeExtent = getGenomeExtent;
    }

    getZoomExtent() {
        const scale = this.#getScale();
        const zoom = scale.props.zoom;
        return resolveZoomExtent(
            scale,
            zoom,
            this.#fromComplexInterval,
            this.#getGenomeExtent,
            this.#getInitialDomainSnapshot,
            this.#getDataZoomExtent
        );
    }

    isZoomable() {
        return this.isZoomingSupported() && !!this.#getScale().props.zoom;
    }

    isZoomingSupported() {
        const type = this.#getScale().type;
        return isContinuous(type) && !isDiscrete(type);
    }

    /**
     * Return true if the scale is zoomable and the current domain differs from the initial domain.
     *
     * @returns true if zoomed
     */
    isZoomed() {
        return (
            this.isZoomingSupported() &&
            !shallowArrayEquals(
                this.#getResetDomain(),
                this.#getScale().domain()
            )
        );
    }

    /**
     * Pans (translates) and zooms using a specified scale factor.
     *
     * @param {number} scaleFactor
     * @param {number} scaleAnchor
     * @param {number} pan
     * @returns {boolean} true if the scale was zoomed
     */
    zoom(scaleFactor, scaleAnchor, pan) {
        if (!this.isZoomingSupported()) {
            return false;
        }

        const scale = this.#getScale();
        const oldDomain = scale.domain();
        let newDomain = applyZoomTransform(
            scale,
            oldDomain,
            scaleFactor,
            scaleAnchor,
            pan
        );

        // TODO: Use the zoomTo method. Move clamping etc there.
        const zoomExtent = this.getZoomExtent();
        newDomain = clampRange(newDomain, zoomExtent[0], zoomExtent[1]);

        if ([0, 1].some((i) => newDomain[i] != oldDomain[i])) {
            void this.#navigate(newDomain, 0);
            return true;
        }

        return false;
    }

    /**
     * Immediately zooms to the given interval.
     *
     * @param {NumericDomain | ComplexDomain} domain
     * @param {ZoomToOptions | boolean | number} [options] Zoom options.
     *      Passing the duration directly as a boolean or number is deprecated.
     */
    async zoomTo(domain, options = false) {
        const { duration, renderImmediately } = normalizeZoomToOptions(options);

        if (!this.isZoomingSupported()) {
            throw new Error("Not a zoomable scale!");
        }

        const scale = this.#getScale();
        const to = normalizeInteractionInterval(
            /** @type {import("../spec/scale.js").ScaleType} */ (scale.type),
            domain,
            this.#fromComplexInterval
        );

        // TODO: Intersect the domain with zoom extent

        if (duration > 0 && renderImmediately) {
            throw new Error(
                "renderImmediately is not supported for animated zooms."
            );
        }
        const transition = this.#navigate(to, duration, renderImmediately);
        if (renderImmediately) {
            this.#renderImmediately();
        }
        return transition;
    }

    /**
     * Resets the current domain to the initial one
     *
     * @returns true if the domain was changed
     */
    resetZoom() {
        if (!this.isZoomingSupported()) {
            throw new Error("Not a zoomable scale!");
        }

        const scale = this.#getScale();
        const oldDomain = scale.domain();
        const newDomain = this.#getResetDomain();

        // Even an equal reset cancels an active transition.
        void this.#navigate(newDomain, 0);
        return !shallowArrayEquals(oldDomain, scale.domain());
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     */
    getZoomLevel() {
        if (this.isZoomable()) {
            const zoomExtent = this.getZoomExtent();
            const referenceDomain = zoomExtent.every(Number.isFinite)
                ? zoomExtent
                : (this.#getInitialDomainSnapshot() ??
                  this.#getScale().domain());
            return span(referenceDomain) / span(this.#getScale().domain());
        }

        return 1.0;
    }
}

/**
 * @param {ZoomToOptions | boolean | number | undefined} options
 * @returns {{ duration: number, renderImmediately: boolean }}
 */
function normalizeZoomToOptions(options) {
    if (options === undefined) {
        return {
            duration: 0,
            renderImmediately: false,
        };
    }

    if (isBoolean(options)) {
        return {
            duration: options ? 700 : 0,
            renderImmediately: false,
        };
    }

    if (typeof options === "number") {
        return {
            duration: options,
            renderImmediately: false,
        };
    }

    const duration = options.duration ?? 0;
    return {
        duration: isBoolean(duration) ? (duration ? 700 : 0) : duration,
        renderImmediately: options.renderImmediately === true,
    };
}

/**
 * @param {ScaleWithProps} scale
 * @param {ZoomParams | boolean | undefined} zoom
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {() => number[]} getGenomeExtent
 * @param {() => number[]} getInitialDomainSnapshot
 * @param {() => number[] | undefined} getDataZoomExtent
 * @returns {number[]}
 */
function resolveZoomExtent(
    scale,
    zoom,
    fromComplexInterval,
    getGenomeExtent,
    getInitialDomainSnapshot,
    getDataZoomExtent
) {
    if (isZoomParams(zoom)) {
        if (isArray(zoom.extent)) {
            return normalizeInteractionInterval(
                scale.props.type,
                zoom.extent,
                fromComplexInterval
            );
        } else if (zoom.extent === "data") {
            return (
                getDataZoomExtent() ??
                getInitialDomainSnapshot() ??
                scale.domain()
            );
        } else if (zoom.extent === "unbounded") {
            if (scale.props.type === "locus") {
                throw new Error(
                    'Zoom extent "unbounded" is not supported for locus scales.'
                );
            }
            return [-Infinity, Infinity];
        }
    }

    if (zoom && scale.props.type == "locus") {
        return getGenomeExtent();
    }

    // TODO: Perhaps this should be "domain" for index scale and nothing for quantitative.
    // Would behave similarly to Vega-Lite, which doesn't have constraints.
    return getInitialDomainSnapshot() ?? scale.domain();
}

/**
 * @param {ScaleWithProps} scale
 * @param {number[]} domain
 * @param {number} scaleFactor
 * @param {number} scaleAnchor
 * @param {number} pan
 * @returns {number[]}
 */
function applyZoomTransform(scale, domain, scaleFactor, scaleAnchor, pan) {
    let newDomain = [...domain];

    /** @type {number} */
    // @ts-ignore
    let anchor = scale.invert(scaleAnchor);

    if (scale.props.reverse) {
        pan = -pan;
    }

    if ("align" in scale) {
        anchor += scale.align();
    }

    switch (scale.type) {
        case "linear":
        case "index":
        case "locus":
            newDomain = panLinear(newDomain, pan || 0);
            break;
        case "log":
            newDomain = panLog(newDomain, pan || 0);
            break;
        case "pow":
        case "sqrt": {
            const powScale =
                /** @type {import("d3-scale").ScalePower<number, number>} */ (
                    scale
                );
            newDomain = panPow(newDomain, pan || 0, powScale.exponent());
            break;
        }
        case "symlog": {
            if (pan !== 0) {
                throw new Error(
                    "Panning is not implemented for: " + scale.type
                );
            }
            break;
        }
        default:
            throw new Error("Zooming is not implemented for: " + scale.type);
    }

    return zoomDomainByScaleType(
        scale,
        /** @type {[number, number]} */ (newDomain),
        anchor,
        scaleFactor
    );
}

/**
 * Converts a user-facing interaction interval into the internal numeric domain
 * representation used by index-like scales.
 *
 * @param {import("../spec/scale.js").ScaleType} type
 * @param {ScalarDomain | ComplexDomain} interval
 * @param {(domain: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @returns {number[]}
 */
function normalizeInteractionInterval(type, interval, fromComplexInterval) {
    const numericInterval =
        type === "locus"
            ? fromComplexInterval(interval)
            : /** @type {number[]} */ (interval);

    // Whole-chromosome locus intervals already resolve to the intended extent.
    if (
        type === "locus" &&
        isChromosomalLocusInterval(interval) &&
        !hasExplicitLocusUpperBound(interval)
    ) {
        return numericInterval;
    }

    return toInternalIndexLikeInterval(type, numericInterval);
}

/**
 * @param {boolean | ZoomParams} zoom
 * @returns {zoom is ZoomParams}
 */
function isZoomParams(zoom) {
    return isObject(zoom);
}
