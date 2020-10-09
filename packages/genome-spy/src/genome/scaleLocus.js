import { ticks as d3ticks, tickStep, extent } from "d3-array";
import { format as d3format } from "d3-format";

/**
 * Creates a "locus" scale, which works similarly to band scale but the domain
 * consists of integer indexes.
 *
 * @typedef {import("./chromMapper").default} ChromMapper
 */
export default function scaleLocus() {
    let domain = [0, 1];
    let range = [0, 1];

    let domainSpan = 1;
    let rangeSpan = 1;

    /** The number of the first element. This affects the generated ticks and their labels. */
    let numberingOffset = 1;

    /** @type {ChromMapper} */
    let cm; // TODO: Consider assimilating ChromMapper into scaleLocus

    /**
     *
     * @param {number} x
     */
    function scale(x) {
        // In principle, the domain consists of integer indices. However,
        // we accept real numbers so that items can be centered inside a band.
        return ((x - domain[0]) / domainSpan) * rangeSpan + range[0];
    }

    /**
     *
     * @param {number} y
     */
    scale.invert = function(y) {
        return ((y - range[0]) / rangeSpan) * domainSpan + domain[0];
    };

    /**
     *
     * @param {Iterable<number>} [_]
     */
    scale.domain = function(_) {
        if (arguments.length) {
            domain = extent(_);
            domainSpan = domain[1] - domain[0];
            return scale;
        } else {
            return domain;
        }
    };

    /**
     *
     * @param {Iterable<number>} [_]
     */
    scale.range = function(_) {
        if (arguments.length) {
            range = [..._];
            rangeSpan = range[1] - range[0];
            return scale;
        } else {
            return range;
        }
    };

    /**
     *
     * @param {number} [_]
     */
    scale.numberingOffset = function(_) {
        if (arguments.length) {
            numberingOffset = _;
            return scale;
        } else {
            return numberingOffset;
        }
    };

    /**
     *
     * @param {ChromMapper} [_]
     */
    scale.chromMapper = function(_) {
        if (arguments.length) {
            cm = _;
            return scale;
        } else {
            return cm;
        }
    };

    // TODO: Mutation
    scale.align = () => 0.5;

    scale.step = () => rangeSpan / domainSpan;

    scale.bandwidth = () => scale.step();

    /**
     * @param {number} count
     * @returns {number[]}
     */
    function simpleTicks(count) {
        return d3ticks(
            domain[0],
            domain[1],
            Math.min(count, Math.ceil(domainSpan))
        )
            .filter(Number.isInteger)
            .map(x => x - numberingOffset);
    }

    /**
     * @param {number} count
     * @returns {number[]}
     */
    function intraChromosomalTicks(count) {
        const [minChrom, maxChrom] = [
            domain[0],
            Math.min(domain[1], cm.totalSize - 1)
        ].map(x => cm.getChromosome(cm.toChromosomal(x).chromosome));

        const step = Math.max(1, tickStep(domain[0], domain[1], count));

        const ticks = [];

        for (let i = minChrom.index; i <= maxChrom.index; i++) {
            const chrom = cm.getChromosomes()[i];

            const from = Math.max(
                chrom.continuousStart + step,
                domain[0] - ((domain[0] - chrom.continuousStart) % step)
            );
            const to = Math.min(chrom.continuousEnd - step / 4, domain[1] + 1);
            for (let pos = from; pos <= to; pos += step) {
                ticks.push(pos - numberingOffset);
            }
        }

        return ticks;
    }

    /**
     * @param {number} count
     * @returns {number[]}
     */
    scale.ticks = count =>
        cm ? intraChromosomalTicks(count) : simpleTicks(count);

    /**
     *
     * @param {number} [count]
     * @param {string} [specifier]
     */
    scale.tickFormat = function(count, specifier) {
        if (specifier) {
            throw new Error(
                "Locus scale's tickFormat does not support a specifier!"
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

        /** @type {function(number):number} */
        const fixer = cm
            ? x =>
                  x -
                  cm.getChromosome(cm.toChromosomal(x).chromosome)
                      .continuousStart
            : x => x;

        return /** @param {number} x */ x =>
            numberFormat(fixer(x) + numberingOffset);
    };

    scale.copy = () =>
        scaleLocus()
            .domain(domain)
            .range(range)
            .numberingOffset(numberingOffset)
            .chromMapper(chromMapper);

    return scale;
}

/**
 *
 * @param {number} x
 * @param {number} binSize
 */
function binStart(x, binSize) {
    return Math.floor(x / binSize) * binSize;
}
