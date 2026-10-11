export default function scaleIndex(): ScaleIndex;

export interface ScaleIndex {
    /** Optional resolution-owned configuration; raw standalone scales omit it. */
    props?: import("../spec/scale.js").Scale;
    (value: number): number;

    invert(x: number): number;

    /** Place within a band using the final logical axis extent. */
    position(
        value: number,
        band?: number,
        before?: boolean,
        extent?: number
    ): number;

    gapMapping(
        extent?: number
    ):
        | ReturnType<
              typeof import("./indexGapMapping.js").createIndexGapMapping
          >
        | undefined;

    gapPositions(): readonly number[];
    domainWithGaps(domain: readonly number[], ranks: readonly number[]): this;
    gapPositions(positions: readonly number[] | null): this;

    gapWidth(): number;
    gapWidth(width: number | null): this;

    axisLength(): number;
    axisLength(extent: number | (() => number)): this;

    gapDomain(): readonly number[] | undefined;
    gapDomain(ranks: readonly number[] | undefined): this;

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
