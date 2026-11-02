import { ScaleBand, ScalePoint } from "d3-scale";
import { Scalar } from "../spec/channel.js";
import { Scale } from "../spec/scale.js";

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

export type NativeCategoricalScale = (
    ScaleBand<Scalar> | ScalePoint<Scalar>
) & {
    type?: string;
    /** Point scales intentionally omit the inner-padding accessor. */
    paddingInner?: ScaleBand<Scalar>["paddingInner"];
    invert(value: number): Scalar | undefined;
    invertRange(extent: readonly number[]): Scalar[] | undefined;
};

export type CategoricalGapScale = NativeCategoricalScale & {
    props?: Scale;
    gapMapping(extent?: number): CategoricalGapMapping | undefined;
    gapPositions(): readonly number[];
    gapPositions(cuts: readonly number[] | null): CategoricalGapScale;
    gapWidth(): number;
    gapWidth(width: number | null): CategoricalGapScale;
    axisLength(): number;
    axisLength(extent: number | (() => number)): CategoricalGapScale;
    copy(): CategoricalGapScale;
};

export default function scaleBand(
    createNativeScale: () => NativeCategoricalScale
): CategoricalGapScale;
