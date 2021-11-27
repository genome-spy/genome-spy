import Genome from "./genome";
import { ScaleIndex } from "./scaleIndex";

export default function scaleLocus(): ScaleLocus;

export interface ScaleLocus extends ScaleIndex {
    genome(): Genome;
    genome(genome: Genome): this;
}

export function isScaleLocus(scale: any): scale is ScaleLocus;
