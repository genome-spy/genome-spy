export default function scaleIndex(): ScaleIndex;

export interface ScaleIndex {
    (value: number): number;

    invert(x: number): number;

    domain(): number[];
    domain(_: Iterable<number>): this;

    range(): number[];
    range(_: Iterable<number>): this;

    numberingOffset(): number;
    numberingOffset(_: number): this;

    padding(): number;
    padding(_: number): this;

    paddingInner(): number;
    paddingInner(_: number): this;

    paddingOuter(): number;
    paddingOuter(_: number): this;

    align(): number;
    align(_: number): this;

    step(): number;

    bandwidth(): number;

    ticks(count: number): number[];

    tickFormat(count?: number, specifier?: string): (x: number) => string;

    copy(): this;
}
