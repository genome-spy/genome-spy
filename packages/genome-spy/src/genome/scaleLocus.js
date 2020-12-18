import { ticks as d3ticks, tickStep, extent } from "d3-array";
import { format as d3format } from "d3-format";
import scaleIndex from "./scaleIndex";

/**
 * Creates a "locus" scale, which works similarly to band scale but the domain
 * consists of integer indexes.
 *
 * @typedef {import("./chromMapper").default} ChromMapper
 */
export default function scaleLocus() {
    const scale = scaleIndex().numberingOffset(1);

    /** @type {ChromMapper} */
    let cm; // TODO: Consider assimilating ChromMapper into scaleLocus

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

    /**
     * @param {number} count
     * @returns {number[]}
     */
    scale.ticks = count => {
        if (!cm) {
            return [];
        }

        const domain = scale.domain();
        const numberingOffset = scale.numberingOffset();

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
    };

    /**
     *
     * @param {number} [count]
     * @param {string} [specifier]
     */
    scale.tickFormat = (count, specifier) => {
        if (!cm) {
            return;
        }

        if (specifier) {
            throw new Error(
                "Locus scale's tickFormat does not support a specifier!"
            );
        }

        const domain = scale.domain();
        const domainSpan = domain[1] - domain[0];
        const numberingOffset = scale.numberingOffset();

        const step = tickStep(
            domain[0],
            domain[1],
            Math.min(count, Math.ceil(domainSpan))
        );
        // Use higher display precision for smaller spans
        // TODO: max absolute value should be taken into account too. 2.00M vs 200M
        const numberFormat = step < 100000 ? d3format(",") : d3format(".3s");

        /** @type {function(number):number} */
        const fixer = x =>
            x -
            cm.getChromosome(cm.toChromosomal(x).chromosome).continuousStart;

        return /** @param {number} x */ x =>
            numberFormat(fixer(x) + numberingOffset);
    };

    const originalCopy = scale.copy;

    scale.copy = () => originalCopy().chromMapper(cm);

    return scale;
}
