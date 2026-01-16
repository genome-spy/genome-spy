import Genome from "../genome/genome.js";
import { ScaleIndex } from "../genome/scaleIndex.js";

/**
 * Creates a "locus" scale, which works similarly to band scale but the domain
 * consists of integer indexes.
 */
export default function scaleLocus(): ScaleLocus;

export interface ScaleLocus extends ScaleIndex {
    genome(): Genome;
    genome(genome: Genome): this;
}

export function isScaleLocus(scale: any): scale is ScaleLocus;

export function toComplexValue(
    genome: Genome | undefined,
    value: number
): number | import("./genome.js").ChromosomalLocus;

export function fromComplexValue(
    genome: Genome | undefined,
    value: number | import("./genome.js").ChromosomalLocus
): number;

export function fromComplexInterval(
    genome: Genome | undefined,
    interval:
        | import("../spec/scale.js").ScalarDomain
        | import("../spec/scale.js").ComplexDomain
): number[];
