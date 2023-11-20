import { ticks as d3ticks, tickStep, extent } from "d3-array";
import { format as d3format } from "d3-format";

const minimumDomainSpan = 1;

/**
 * Creates a "index" scale, which works similarly to d3's band scale but the domain
 * consists of integer indexes.
 */
export default function scaleIndex() {
    let domain = [0, 1];
    let range = [0, 1];

    let domainSpan = 1;
    let rangeSpan = 1;

    let paddingInner = 0;
    let paddingOuter = 0;
    let align = 0.5;

    /** The number of the first element. This affects the generated ticks and their labels. */
    let numberingOffset = 0;

    const scaleFunction = (/** @type {number} */ x) =>
        ((x + align - domain[0]) / domainSpan) * rangeSpan + range[0];

    /**
     * In principle, the domain consists of integer indices. However,
     * we accept real numbers so that items can be centered inside a band.
     *
     * @type {import("./scaleIndex.js").ScaleIndex}
     */
    const scale = /** @type {any} */ (scaleFunction);

    scale.invert = (y) =>
        ((y - range[0]) / rangeSpan) * domainSpan + domain[0] - align;

    // @ts-expect-error
    scale.domain = function (_) {
        if (arguments.length) {
            domain = extent(_);
            domainSpan = domain[1] - domain[0];
            const uninitializedDomain = domain[0] === 0 && domain[0] === 0;

            if (domainSpan < minimumDomainSpan && !uninitializedDomain) {
                domainSpan = minimumDomainSpan;
                const centroid = (domain[0] + domain[1]) / 2;
                domain[0] = centroid - domainSpan / 2;
                domain[1] = centroid + domainSpan / 2;
            }

            return scale;
        } else {
            return domain.slice();
        }
    };

    // @ts-expect-error
    scale.range = function (_) {
        if (arguments.length) {
            range = [..._];
            rangeSpan = range[1] - range[0];
            return scale;
        } else {
            return range;
        }
    };

    // @ts-expect-error
    scale.numberingOffset = function (_) {
        if (arguments.length) {
            numberingOffset = _;
            return scale;
        } else {
            return numberingOffset;
        }
    };

    // @ts-expect-error
    scale.padding = function (_) {
        if (arguments.length) {
            paddingOuter = _;
            paddingInner = Math.min(1, _);
            return scale;
        } else {
            return paddingInner;
        }
    };

    // @ts-expect-error
    scale.paddingInner = function (_) {
        if (arguments.length) {
            paddingInner = Math.min(1, _);
            return scale;
        } else {
            return paddingInner;
        }
    };

    // @ts-expect-error
    scale.paddingOuter = function (_) {
        if (arguments.length) {
            paddingOuter = _;
            return scale;
        } else {
            return paddingOuter;
        }
    };

    // @ts-expect-error
    scale.align = function (_) {
        if (arguments.length) {
            align = Math.max(0, Math.min(1, _));
            return scale;
        } else {
            return align;
        }
    };

    scale.step = () => rangeSpan / domainSpan;

    scale.bandwidth = () => scale.step();

    scale.ticks = (count) => {
        const align = /** @type {number} */ (scale.align());
        const offset = /** @type {number} */ (scale.numberingOffset());
        return d3ticks(
            domain[0] - align + offset,
            domain[1] - align + offset,
            Math.min(count, Math.ceil(domainSpan))
        )
            .filter(Number.isInteger)
            .map((x) => x - numberingOffset);
    };

    scale.tickFormat = (count, specifier) => {
        if (specifier) {
            throw new Error(
                "Index scale's tickFormat does not support a specifier!"
            );
        }

        const step = tickStep(
            domain[0],
            domain[1],
            Math.min(count, Math.ceil(domainSpan))
        );
        // Use higher display precision for smaller spans
        // TODO: max absolute value should be taken into account too. 2.00M vs 200M
        const numberFormat = step < 100000 ? d3format(",") : d3format(".3s");

        return /** @param {number} x */ (x) =>
            numberFormat(x + numberingOffset);
    };

    scale.copy = () =>
        scaleIndex()
            .domain(domain)
            .range(range)
            .paddingInner(paddingInner)
            .paddingOuter(paddingOuter)
            .numberingOffset(numberingOffset);

    return scale;
}
