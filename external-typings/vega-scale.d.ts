type MetaDatum =
    | "continuous"
    | "discrete"
    | "discretizing"
    | "interpolating"
    | "log"
    | "temporal";

type Color = string;
type Interpolator<T> = (t: number) => T;
type ColorInterpolator = Interpolator<Color>;

declare module "vega-scale" {
    // TODO: Correct return type
    export function scale(
        type: string,
        scale: () => any,
        metadata: MetaDatum | MetaDatum[]
    ): any;

    export function scheme(
        name: string,
        scheme: string[] | ColorInterpolator
    ): void;
    export function scheme(name: string): ColorInterpolator;

    // TODO: Correct return type
    export function interpolate(name: string, gamma?: number): any;

    export function interpolateColors(
        colors: Color[],
        type?: string,
        gamma?: number
    ): ColorInterpolator;

    export function interpolateRange<T>(
        interpolator: Interpolator<T>,
        range: number[]
    ): Interpolator<T>;

    export function quantizeInterpolator<T>(
        interpolator: Interpolator<T>,
        count: number
    ): T[];

    export function isValidScaleType(type: string): boolean;
    export function isContinuous(key: string): boolean;
    export function isDiscrete(key: string): boolean;
    export function isDiscretizing(key: string): boolean;
    export function isLogarithmic(key: string): boolean;
    export function isTemporal(key: string): boolean;
    export function isInterpolating(key: string): boolean;
    export function isQuantile(key: string): boolean;

    export function bandSpace(
        count: number,
        paddingInner: number,
        paddingOuter: number
    ): number;
}
