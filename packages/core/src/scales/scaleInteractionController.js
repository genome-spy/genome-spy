import {
    clampRange,
    isArray,
    isBoolean,
    isObject,
    panLinear,
    panLog,
    panPow,
    span,
    zoomLinear,
    zoomLog,
    zoomPow,
} from "vega-util";
import { isContinuous, isDiscrete } from "vega-scale";
import { easeCubicInOut } from "d3-ease";

import eerp from "../utils/eerp.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import { createCancelToken } from "../utils/transition.js";

/**
 * @typedef {import("../spec/scale.js").NumericDomain} NumericDomain
 * @typedef {import("../spec/scale.js").ScalarDomain} ScalarDomain
 * @typedef {import("../spec/scale.js").ComplexDomain} ComplexDomain
 * @typedef {import("../spec/scale.js").ZoomParams} ZoomParams
 * @typedef {import("../types/encoder.js").VegaScale} VegaScale
 * @typedef {VegaScale & { props: import("../spec/scale.js").Scale }} ScaleWithProps
 */

export default class ScaleInteractionController {
    /** @type {() => ScaleWithProps} */
    #getScale;

    /** @type {() => import("../utils/animator.js").default} */
    #getAnimator;

    /** @type {() => number[]} */
    #getInitialDomainSnapshot;

    /** @type {() => number[]} */
    #getResetDomain;

    /** @type {(domain: ScalarDomain | ComplexDomain) => number[]} */
    #fromComplexInterval;

    /** @type {() => number[]} */
    #getGenomeExtent;

    /** @type {{ canceled: boolean } | null} */
    #zoomTransitionToken = null;

    /**
     * @param {object} options
     * @param {() => ScaleWithProps} options.getScale
     * @param {() => import("../utils/animator.js").default} options.getAnimator
     * @param {() => number[]} options.getInitialDomainSnapshot
     * @param {() => number[]} options.getResetDomain
     * @param {(domain: ScalarDomain | ComplexDomain) => number[]} options.fromComplexInterval
     * @param {() => number[]} options.getGenomeExtent
     */
    constructor({
        getScale,
        getAnimator,
        getInitialDomainSnapshot,
        getResetDomain,
        fromComplexInterval,
        getGenomeExtent,
    }) {
        this.#getScale = getScale;
        this.#getAnimator = getAnimator;
        this.#getInitialDomainSnapshot = getInitialDomainSnapshot;
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
            this.#getInitialDomainSnapshot
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
     * @param {number[]} previousDomain
     * @param {number[]} newDomain
     * @returns {"restore" | "animate" | "notify" | "none"}
     */
    getDomainChangeAction(previousDomain, newDomain) {
        if (shallowArrayEquals(newDomain, previousDomain)) {
            return "none";
        }
        if (this.isZoomable()) {
            return "restore";
        }
        if (this.isZoomingSupported()) {
            return "animate";
        }
        return "notify";
    }

    /**
     * Return true if the scale is zoomable and the current domain differs from the initial domain.
     *
     * @returns true if zoomed
     */
    isZoomed() {
        return (
            this.isZoomingSupported() &&
            shallowArrayEquals(
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
            scale.domain(newDomain);
            return true;
        }

        return false;
    }

    /**
     * Immediately zooms to the given interval.
     *
     * @param {NumericDomain | ComplexDomain} domain
     * @param {boolean | number} [duration] an approximate duration for transition.
     *      Zero duration zooms immediately. Boolean `true` indicates a default duration.
     */
    async zoomTo(domain, duration = false) {
        if (isBoolean(duration)) {
            duration = duration ? 700 : 0;
        }

        if (!this.isZoomingSupported()) {
            throw new Error("Not a zoomable scale!");
        }

        const to = this.#fromComplexInterval(domain);

        // TODO: Intersect the domain with zoom extent

        const animator = this.#getAnimator();

        const scale = this.#getScale();
        const from = /** @type {number[]} */ (scale.domain());

        if (duration > 0 && from.length == 2) {
            // Spans
            const fw = from[1] - from[0];
            const tw = to[1] - to[0];

            // Centers
            const fc = from[0] + fw / 2;
            const tc = to[0] + tw / 2;

            // Constant endpoints. Skip calculation to maintain precision.
            const ac = from[0] == to[0];
            const bc = from[1] == to[1];

            this.#cancelZoomTransition();
            const cancelToken = createCancelToken();
            this.#zoomTransitionToken = cancelToken;

            await animator.transition({
                duration,
                easingFunction: easeCubicInOut,
                cancelToken,
                onUpdate: (t) => {
                    const w = eerp(fw, tw, t);
                    const wt = fw == tw ? t : (fw - w) / (fw - tw);
                    const c = wt * tc + (1 - wt) * fc;
                    const newDomain = [
                        ac ? from[0] : c - w / 2,
                        bc ? from[1] : c + w / 2,
                    ];
                    scale.domain(newDomain);
                },
            });

            if (this.#zoomTransitionToken === cancelToken) {
                this.#zoomTransitionToken = null;
            }
            scale.domain(to);
        } else {
            this.#cancelZoomTransition();
            scale.domain(to);
            animator?.requestRender();
        }
    }

    #cancelZoomTransition() {
        if (this.#zoomTransitionToken) {
            this.#zoomTransitionToken.canceled = true;
            this.#zoomTransitionToken = null;
        }
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

        if ([0, 1].some((i) => newDomain[i] != oldDomain[i])) {
            scale.domain(newDomain);
            return true;
        }
        return false;
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     */
    getZoomLevel() {
        // Zoom level makes sense only for user-zoomable scales where zoom extent is defined
        if (this.isZoomable()) {
            return span(this.getZoomExtent()) / span(this.#getScale().domain());
        }

        return 1.0;
    }
}

/**
 * @param {ScaleWithProps} scale
 * @param {ZoomParams | boolean | undefined} zoom
 * @param {(interval: ScalarDomain | ComplexDomain) => number[]} fromComplexInterval
 * @param {() => number[]} getGenomeExtent
 * @param {() => number[]} getInitialDomainSnapshot
 * @returns {number[]}
 */
function resolveZoomExtent(
    scale,
    zoom,
    fromComplexInterval,
    getGenomeExtent,
    getInitialDomainSnapshot
) {
    if (isZoomParams(zoom)) {
        if (isArray(zoom.extent)) {
            return fromComplexInterval(zoom.extent);
        }
    }

    if (zoom && scale.props.type == "locus") {
        return getGenomeExtent();
    }

    // TODO: Perhaps this should be "domain" for index scale and nothing for quantitative.
    // Would behave similarly to Vega-Lite, which doesn't have constraints.
    return getInitialDomainSnapshot();
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

    // TODO: symlog
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
        case "sqrt": {
            const powScale =
                /** @type {import("d3-scale").ScalePower<number, number>} */ (
                    scale
                );
            newDomain = panPow(newDomain, pan || 0, powScale.exponent());
            newDomain = zoomPow(
                newDomain,
                anchor,
                scaleFactor,
                powScale.exponent()
            );
            break;
        }
        default:
            throw new Error("Zooming is not implemented for: " + scale.type);
    }

    return newDomain;
}

/**
 * @param {boolean | ZoomParams} zoom
 * @returns {zoom is ZoomParams}
 */
function isZoomParams(zoom) {
    return isObject(zoom);
}

/**
 * @param {any[]} a
 * @param {any[]} b
 */
