import { tickStep } from "d3-array";
import { format as d3format } from "d3-format";

import scaleIndex from "./scaleIndex.js";
import { isChromosomalLocus, isChromosomalLocusInterval } from "./genome.js";

export default function scaleLocus() {
    /** @type {import("./scaleLocus.js").ScaleLocus} */
    const scale = /** @type {any} */ (scaleIndex().numberingOffset(1));

    /** @type {import("./genome.js").default} */
    let genome;

    // @ts-expect-error
    scale.genome = function (_) {
        if (arguments.length) {
            genome = _;
            return scale;
        } else {
            return genome;
        }
    };

    scale.ticks = (count) => {
        if (!genome) {
            return [];
        }

        const domain = scale.domain();
        const numberingOffset = scale.numberingOffset();

        const [minChrom, maxChrom] = [
            Math.max(domain[0], 0),
            Math.min(domain[1], genome.totalSize - 1),
        ].map((x) => genome.toChromosome(x));

        const step = Math.max(1, tickStep(domain[0], domain[1], count));

        const ticks = [];

        for (let i = minChrom.index; i <= maxChrom.index; i++) {
            const chrom = genome.chromosomes[i];

            const from = Math.max(
                chrom.continuousStart + step,
                domain[0] - ((domain[0] - chrom.continuousStart) % step)
            );
            const to = Math.min(chrom.continuousEnd - step / 4, domain[1] + 1);
            for (let pos = from; pos <= to; pos += step) {
                const tick = pos - numberingOffset;
                if (tick >= domain[0] && tick < domain[1]) {
                    ticks.push(tick);
                }
            }
        }

        return ticks;
    };

    scale.tickFormat = (count, specifier) => {
        if (!genome) {
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
        const numberFormat = step < 1e6 ? d3format(",") : d3format(".3s");

        /** @type {function(number):number} */
        const fixer = (x) => x - genome.toChromosome(x).continuousStart;

        return /** @param {number} x */ (x) =>
            numberFormat(fixer(x) + numberingOffset);
    };

    const originalCopy = scale.copy;

    scale.copy = () => {
        const copied = originalCopy();
        let copiedGenome = genome;
        // @ts-expect-error
        copied.genome = function (_) {
            if (arguments.length) {
                copiedGenome = _;
                return copied;
            } else {
                return copiedGenome;
            }
        };
        return copied.genome(genome);
    };

    return scale;
}

/**
 * @type {import("./scaleLocus.js").isScaleLocus}
 */
export function isScaleLocus(scale) {
    return scale.type == "locus";
}

/**
 * @param {import("./genome.js").default | { genome?: () => import("./genome.js").default } | undefined} scaleOrGenome
 * @param {number} value
 * @returns {number | import("./genome.js").ChromosomalLocus}
 */
export function toComplexValue(scaleOrGenome, value) {
    const genome = resolveGenome(scaleOrGenome);
    return genome ? genome.toChromosomal(value) : value;
}

/**
 * @param {import("./genome.js").default | { genome?: () => import("./genome.js").default } | undefined} scaleOrGenome
 * @param {number | import("./genome.js").ChromosomalLocus} complex
 * @returns {number}
 */
export function fromComplexValue(scaleOrGenome, complex) {
    const genome = resolveGenome(scaleOrGenome);
    if (genome && isChromosomalLocus(complex)) {
        return genome.toContinuous(complex.chrom, complex.pos);
    }
    return /** @type {number} */ (complex);
}

/**
 * @param {import("./genome.js").default | { genome?: () => import("./genome.js").default } | undefined} scaleOrGenome
 * @param {import("../spec/scale.js").ScalarDomain | import("../spec/scale.js").ComplexDomain} interval
 * @returns {number[]}
 */
export function fromComplexInterval(scaleOrGenome, interval) {
    const genome = resolveGenome(scaleOrGenome);
    if (genome && isChromosomalLocusInterval(interval)) {
        return genome.toContinuousInterval(interval);
    }
    return /** @type {number[]} */ (interval);
}

/**
 * @param {import("./genome.js").default | { genome?: () => import("./genome.js").default } | undefined} scaleOrGenome
 * @param {import("../spec/scale.js").ScalarDomain | import("../spec/scale.js").ComplexDomain} interval
 * @returns {import("../spec/scale.js").ScalarDomain | import("../spec/scale.js").ComplexDomain}
 */
export function toComplexInterval(scaleOrGenome, interval) {
    const genome = resolveGenome(scaleOrGenome);
    return genome
        ? genome.toChromosomalInterval(/** @type {number[]} */ (interval))
        : interval;
}

/**
 * @param {import("./genome.js").default | { genome?: () => import("./genome.js").default } | undefined} scaleOrGenome
 * @returns {number[]}
 */
export function getGenomeExtent(scaleOrGenome) {
    const genome = resolveGenome(scaleOrGenome);
    if (!genome) {
        throw new Error("No genome has been defined!");
    }
    return genome.getExtent();
}

/**
 * @param {import("./genome.js").default | { genome?: () => import("./genome.js").default } | undefined} scaleOrGenome
 * @returns {import("./genome.js").default | undefined}
 */
function resolveGenome(scaleOrGenome) {
    if (scaleOrGenome && "toChromosomal" in scaleOrGenome) {
        return scaleOrGenome;
    }
    if (scaleOrGenome && "genome" in scaleOrGenome) {
        return scaleOrGenome.genome();
    }
    return undefined;
}
