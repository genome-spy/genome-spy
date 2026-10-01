import { expect, test } from "vitest";
import scaleIndex from "./scaleIndex.js";

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
