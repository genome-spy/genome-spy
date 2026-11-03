import { Scalar } from "../spec/channel.js";
import { Scale } from "../spec/scale.js";

/** Internal navigation state for a band or point scale. */
export interface CategoricalViewport {
    /** Half-open category-rank interval; endpoints may be fractional. */
    interval: [number, number];
    /** Fractional gap-edge ranks. Preserve these for exact restoration through grouping gaps. */
    gapRanks?: [number, number];
}

export function copyViewport(
    value: CategoricalViewport | null
): CategoricalViewport | null;

export function clampViewport(
    viewport: CategoricalViewport | null | undefined,
    length: number
): CategoricalViewport | null | undefined;

/** Forward projection shared by categorical and index-like grouping gaps. */
export interface GroupingGapMapping<Value = Scalar> {
    position(value: Value, band?: number, before?: boolean): number | undefined;
    step: number;
    fits: boolean;
}

export interface CategoricalGapMapping extends GroupingGapMapping {
    bandwidth: number;
    invertRange(extent: readonly number[]): Scalar[] | undefined;
}

export interface CategoricalGapScale {
    (value: Scalar): number | undefined;
    type?: string;
    props?: Scale;
    domain(): Scalar[];
    domain(values: Iterable<Scalar>): this;
    viewport(): CategoricalViewport | null;
    viewport(value: CategoricalViewport | null): this;
    navigationMapping(
        extent?: number
    ): ReturnType<typeof import("./bandMapping.js").createBandMapping>;
    range(): number[];
    range(values: Iterable<number>): this;
    rangeRound(values: Iterable<number>): this;
    round(): boolean;
    round(value: boolean): this;
    padding(): number;
    padding(value: number): this;
    /** Point scales intentionally omit the inner-padding accessor. */
    paddingInner?(): number;
    paddingInner?(value: number): this;
    paddingOuter(): number;
    paddingOuter(value: number): this;
    align(): number;
    align(value: number): this;
    step(): number;
    bandwidth(): number;
    invert(value: number): Scalar | undefined;
    invertRange(extent: readonly number[]): Scalar[] | undefined;
    gapMapping(extent?: number): CategoricalGapMapping | undefined;
    /** Preferred CSS extent for a base step, independent of occurrence layout. */
    sizeForStep(step: number): number;
    gapPositions(): readonly number[];
    gapPositions(cuts: readonly number[] | null): this;
    gapWidth(): number;
    gapWidth(width: number | null): this;
    axisLength(): number;
    axisLength(extent: number | (() => number)): this;
    copy(): this;
}

export default function scaleBand(): CategoricalGapScale;

export function scalePoint(): CategoricalGapScale;
