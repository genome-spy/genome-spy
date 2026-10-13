import { expect, test } from "vitest";
import scaleIndex from "./scaleIndex.js";

test("grouping gaps separate half-open endpoints without stretching bands", () => {
    const scale = scaleIndex()
        .domain([0, 20])
        .range([100, 200])
        .gapPositions([10])
        .gapWidth(6);

    const before = scale.position(10, 0, true);
    const after = scale.position(10);
    expect(after - before).toBeCloseTo(6);
    expect(scale.position(9, 1)).toBeCloseTo(before);
    expect(scale.position(9, 0.5) - scale(9)).toBeCloseTo(
        scale.bandwidth() / 2
    );
    expect(scale.position(20, 0, true) - scale(0)).toBeCloseTo(100);
    for (const pixel of [before, before + 1, after - 1, after]) {
        expect(scale.invert(pixel)).toBeCloseTo(10);
    }
});

test("gap width uses the final placement extent and preserves reversed output", () => {
    const scale = scaleIndex()
        .domain([0, 20])
        .range([1, 0])
        .gapPositions([10])
        .gapWidth(6)
        .axisLength(100);

    for (const extent of [100, 200]) {
        const before = scale.position(10, 0, true, extent);
        const after = scale.position(10, 0, false, extent);
        expect((before - after) * extent).toBeCloseTo(6);
        expect(
            scale.gapMapping(extent).invertPoint((before + after) / 2).value
        ).toBe(10);
    }
    expect(scale.copy().position(10)).toBe(scale.position(10));
});

test("cut search retains exact large integers and ignores outer cuts for fitting", () => {
    const base = 2 ** 35;
    const scale = scaleIndex()
        .domain([base, base + 20])
        .range([0, 100])
        .gapPositions([base + 30, base + 10, 0, base + 10])
        .gapWidth(6);
    expect(
        scale.position(base + 10) - scale.position(base + 10, 0, true)
    ).toBeCloseTo(6);
    expect(scale.invert(50)).toBe(base + 10);
    expect(scale.position(base + 20, 0, true)).toBeCloseTo(100);
});

test("zero/null/empty gap configurations use ordinary mapping", () => {
    const scale = scaleIndex().domain([0, 20]).range([0, 100]);
    scale.gapPositions([10]).gapWidth(0);
    expect(scale.gapMapping()).toBeUndefined();
    expect(scale(10)).toBe(50);
    scale.gapWidth(6).gapPositions(null);
    expect(scale.gapMapping()).toBeUndefined();
    expect(scale(10)).toBe(50);
});

test.each([
    [0, 1],
    [1, 0],
])(
    "exhausted range %j recovers on resize and keeps navigation defined",
    (start, end) => {
        let width = 100;
        const scale = scaleIndex()
            .domain([0, 20])
            .range([start, end])
            .gapPositions([10])
            .gapWidth(6)
            .axisLength(() => width);

        for (width of [6, 4]) {
            expect(scale.gapMapping().fits).toBe(false);
            expect(scale(5)).toBeNaN();
            expect(scale.invert(0.25)).toBeCloseTo(start === 0 ? 5 : 15);
            expect(scale.gapMapping().navigate(2, 0.5, 0).domain).toEqual([
                -10, 30,
            ]);
        }
        width = 100;
        expect(scale.gapMapping().fits).toBe(true);
        expect(
            Math.abs(scale.position(10) - scale.position(10, 0, true)) * width
        ).toBeCloseTo(6);
    }
);

test("returns band starts with defaults", () => {
    const scale = scaleIndex();

    expect(scale(-1)).toEqual(-1);
    expect(scale(0)).toEqual(0);
    expect(scale(1)).toEqual(1);
    expect(scale(2)).toEqual(2);
});

test.each([0, 0.5, 1])(
    "alignment %s does not affect unpadded mapping or viewport inversion",
    (align) => {
        const scale = scaleIndex()
            .domain([1.25, 11.25])
            .range([100, 200])
            .align(align);

        expect(scale(2)).toBe(107.5);
        expect(scale.invert(107.5)).toBe(2);
        expect([scale.invert(100), scale.invert(200)]).toEqual(scale.domain());
    }
);

test("Scale floors fractional index inputs", () => {
    const scale = scaleIndex().domain([0, 10]).range([100, 200]).align(0);

    expect(scale(3.1)).toEqual(scale(3));
    expect(scale(3.9)).toEqual(scale(3));
});

test("domain() accepts numeric ordinal domain and computes its extent", () => {
    const scale = scaleIndex().domain([7, 3, 5, 9, 8]);
    expect(scale.domain()).toEqual([3, 9]);
});

test("domain() clamps the minimum domain span to one", () => {
    const scale = scaleIndex().domain([1.25, 1.75]);
    expect(scale.domain()).toEqual([1, 2]);

    scale.domain([1.75, 2.25]);
    expect(scale.domain()).toEqual([1.5, 2.5]);
});

test("bandwidth() is positive and respects inner padding", () => {
    const scale = scaleIndex().domain([0, 50]).range([1, 0]).paddingInner(0.3);

    expect(scale.bandwidth()).toBeCloseTo(0.7 / 49.7);
});

test("padding affects step, placement, and inversion like the WebGL scale", () => {
    const scale = scaleIndex().domain([0, 40]).range([1, 0]).padding(0.5);

    expect(scale.step()).toBeCloseTo(-1 / 40.5);
    expect(scale.bandwidth()).toBeCloseTo(0.5 / 40.5);
    expect(scale(0)).toBeCloseTo(0.987654321);
    expect(scale(40)).toBeCloseTo(0);
    expect(scale.invert(scale(0))).toBeCloseTo(0);
    expect(scale.invert(scale(17))).toBeCloseTo(17);
    expect(scale.invert(scale(40))).toBeCloseTo(40);
});

test("copy preserves padding and alignment", () => {
    const scale = scaleIndex()
        .domain([0, 10])
        .range([100, 200])
        .paddingInner(0.2)
        .paddingOuter(0.4)
        .align(0.25);
    const copy = scale.copy();

    expect(copy.paddingInner()).toBe(0.2);
    expect(copy.paddingOuter()).toBe(0.4);
    expect(copy.align()).toBe(0.25);
    expect(copy(3)).toBeCloseTo(scale(3));
});

test("ticks() produces integer values", () => {
    const scale = scaleIndex().domain([0, 5]).numberingOffset(0);

    expect(scale.ticks(5)).toEqual([0, 1, 2, 3, 4]);
    expect(scale.ticks(100)).toEqual([0, 1, 2, 3, 4]);
});

test("ticks follow visible band centers when padding and alignment shift bands", () => {
    const scale = scaleIndex()
        .domain([0.4, 5.4])
        .paddingInner(0.2)
        .paddingOuter(0.4);

    expect(scale.align(0).ticks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(scale.align(1).ticks(5)).toEqual([0, 1, 2, 3, 4]);
});

test("ticks() take numberingOffset into account", () => {
    const scale = scaleIndex().domain([10, 15]).numberingOffset(1);

    // The ticks have been offset so that nice labels can be generated (5, 10, 15, ...)
    expect(scale.ticks(5)).toEqual([10, 11, 12, 13, 14]);
});

test("tickFormat() takes numberingOffset into account", () => {
    const scale = scaleIndex().domain([10, 15]).numberingOffset(1);

    const format = scale.tickFormat(5);

    // Although the ticks have been offset, the labels should be nice
    expect(scale.ticks(5).map(format)).toEqual(["11", "12", "13", "14", "15"]);
});

test("navigation retains partial gaps and the data slope while panning", () => {
    const scale = scaleIndex()
        .domain([9, 29])
        .range([0, 100])
        .gapPositions([10])
        .gapWidth(6);
    const previous = scale.gapMapping();
    const next = previous.navigate(1, 50, -0.06);
    expect(next.domain[0]).toBe(10);
    expect(next.ranks[0]).toBeGreaterThan(0);
    expect(next.ranks[0]).toBeLessThan(1);
    scale.domainWithGaps(next.domain, next.ranks);
    expect(scale.gapMapping().step).toBeCloseTo(previous.step);
    expect(scale.position(10)).toBeCloseTo(previous.position(10) - 6);
    expect(scale.invert(2)).toBe(10);
    expect(scale.copy().position(10)).toBeCloseTo(scale.position(10));
});

test("zoom anchors retain fractional progress within a gap at maximum zoom", () => {
    const scale = scaleIndex()
        .domain([9, 11])
        .range([0, 100])
        .gapPositions([10])
        .gapWidth(6);
    const point = scale.gapMapping().invertPoint(50);
    const next = scale.gapMapping().navigate(0.1, 50, 0);
    scale.domainWithGaps(next.domain, next.ranks);
    expect(scale.gapMapping().invertPoint(50)).toEqual(point);
    expect(scale.position(10) - scale.position(10, 0, true)).toBe(6);
    expect(scale.gapMapping().step).toBeCloseTo(100);
});

test("animated cameras keep partial edge gaps and handle almost equal slopes", () => {
    const source = scaleIndex()
        .domain([0, 20])
        .range([0, 1])
        .gapPositions([10])
        .gapWidth(6)
        .axisLength(100);
    const target = source.copy().domain([1, 20.999999999999996]);
    const mapping = source.gapMapping();
    const end = mapping.interpolate(target.gapMapping(), 1);
    expect(end.domain[0]).toBeCloseTo(1);
    expect(end.domain[1]).toBeCloseTo(21);
    const shifted = source.copy().domain([10, 30]).gapMapping();
    let previous = mapping.position(10);
    for (let i = 1; i <= 100; i++) {
        const frame = mapping.interpolate(shifted, i / 100);
        const scale = source.copy().domainWithGaps(frame.domain, frame.ranks);
        const after = scale.position(10);
        expect(after - scale.position(10, 0, true)).toBeCloseTo(0.06);
        expect(Math.abs(after - previous)).toBeLessThan(0.01);
        previous = after;
    }
});
