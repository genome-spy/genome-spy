import { expect, test } from "vitest";
import scaleIndex from "./scaleIndex";

test("Scale with defaults works as expected", () => {
    const scale = scaleIndex();

    expect(scale(-1)).toEqual(-1);
    expect(scale(0)).toEqual(0);
    expect(scale(1)).toEqual(1);
    expect(scale(2)).toEqual(2);
});

test("Scale scales correctly with custom domain and range", () => {
    const scale = scaleIndex().domain([0, 10]).range([100, 200]);

    expect(scale(0)).toEqual(100);
    expect(scale(10)).toEqual(200);
});

test("Invert works as expected", () => {
    const scale = scaleIndex().domain([0, 10]).range([100, 200]);

    expect(scale.invert(scale(0))).toEqual(0);
    expect(scale.invert(scale(5))).toEqual(5);
    expect(scale.invert(scale(10))).toEqual(10);
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

test("ticks() produces integer values", () => {
    const scale = scaleIndex().domain([0, 5]).numberingOffset(0);

    expect(scale.ticks(5)).toEqual([0, 1, 2, 3, 4]);
    expect(scale.ticks(100)).toEqual([0, 1, 2, 3, 4]);
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
