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
