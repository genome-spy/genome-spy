import { expect, test } from "vitest";
import scaleBand, { scalePoint } from "./scaleBand.js";

/** @param {"band" | "point"} [type] */
const create = (type = "band") =>
    type === "point" ? scalePoint() : scaleBand();

test("ordinary bands retain rounded padded layout, domain normalization, and independent copies", () => {
    const scale = create()
        .domain(["A", "A", "B"])
        .rangeRound([103, 0])
        .paddingInner(0.2)
        .paddingOuter(0.1)
        .align(0.3);
    expect(scale.domain()).toEqual(["A", "B"]);
    expect(scale.domain().map(scale)).toEqual([54, 3]);
    expect(scale.step()).toBe(51);
    expect(scale.bandwidth()).toBe(41);
    expect(scale.invert(48)).toBeUndefined();
    expect(scale.invert(44)).toBe("B");

    const range = scale.range();
    range[0] = 0;
    expect(scale.range()).toEqual([103, 0]);
    const copy = scale.copy();
    scale.padding(-1).align(2);
    expect(scale.padding()).toBe(0);
    expect(scale.align()).toBe(1);
    expect(copy.domain().map(copy)).toEqual([54, 3]);

    scale.domain(["only"]).range([0, 100]).round(false).paddingInner(0.8);
    expect(scale.step()).toBeCloseTo(500);
    expect(scale.bandwidth()).toBeCloseTo(100);
    scale.domain([]);
    expect(scale.step()).toBe(100);
    expect(scale.bandwidth()).toBeCloseTo(20);
    expect(scale.invertRange([0, 0])).toEqual([]);
});

test("categorical gaps preserve equal cells, inverse membership, and copied state", () => {
    const scale = create()
        .domain(["A", "B", "C", "D"])
        .range([0, 1])
        .gapPositions([2])
        .gapWidth(8)
        .axisLength(88);
    const mapping = scale.gapMapping();

    expect(scale.domain().map((value) => scale(value) * 88)).toEqual([
        0, 20, 48, 68,
    ]);
    expect(scale.bandwidth() * 88).toBeCloseTo(20);
    expect(mapping.position("C", 1) * 88).toBeCloseTo(68);
    expect(scale("missing")).toBeUndefined();
    expect(scale.invert(30 / 88)).toBe("B");
    expect(scale.invert(44 / 88)).toBeUndefined();
    expect(scale.invertRange([18 / 88, 50 / 88])).toEqual(["A", "B", "C"]);
    expect(scale.invertRange([41 / 88, 47 / 88])).toBeUndefined();

    const copy = scale.copy();
    scale.gapWidth(16);
    expect(copy("C") * 88).toBeCloseTo(48);
    expect(copy.invert(44 / 88)).toBeUndefined();
    scale.domain(["D", "C", "B", "A"]).gapPositions([1]);
    expect(mapping.position("C") * 88).toBeCloseTo(48);
});

test("reversed padded bands use placement-local gaps and positive band anchors", () => {
    const scale = create().domain(["A", "B", "C", "D"]).range([5, 2]);
    scale.paddingInner(0.2).paddingOuter(0.3).align(0.1);
    scale.gapPositions([2]).gapWidth(8);

    for (const extent of [100, 200]) {
        const mapping = scale.gapMapping(extent);
        const compressed = create()
            .domain(scale.domain())
            .range([5 - 8 / extent, 2])
            .paddingInner(0.2)
            .paddingOuter(0.3)
            .align(0.1);
        expect(mapping.position("D")).toBeCloseTo(compressed("D"));
        expect(mapping.bandwidth).toBeCloseTo(compressed.bandwidth());
        expect(mapping.position("B") - mapping.position("C")).toBeCloseTo(
            mapping.step + 8 / extent
        );
        expect(mapping.position("C") - mapping.position("D")).toBeCloseTo(
            mapping.step
        );
        expect(mapping.position("B", 0.5) - mapping.position("B")).toBeCloseTo(
            mapping.bandwidth / 2
        );
        expect(mapping.invertRange([2, 5])).toEqual(["A", "B", "C", "D"]);
    }
    // Resolution-default inversion must use the same padded placement.
    scale.axisLength(100);
    expect(scale.invert(scale("C") + scale.bandwidth() / 2)).toBe("C");
});

test("point scales share gap geometry while retaining zero bandwidth and singleton alignment", () => {
    const scale = create("point")
        .domain(["A", "B", "C", "D"])
        .gapPositions([2])
        .gapWidth(8)
        .axisLength(68);

    expect(scale.domain().map((value) => scale(value) * 68)).toEqual([
        0,
        expect.closeTo(20),
        expect.closeTo(48),
        68,
    ]);
    expect(scale.bandwidth()).toBe(0);
    expect(scale.invert(48 / 68)).toBe("C");
    expect(scale.invert(44 / 68)).toBeUndefined();

    const padded = create("point")
        .domain(["A", "B", "C"])
        .range([100, 0])
        .padding(0.25);
    expect(padded.domain().map(padded)).toEqual([90, 50, 10]);
    const paddedCopy = padded.copy();
    expect(paddedCopy.domain().map(paddedCopy)).toEqual([90, 50, 10]);
    expect(paddedCopy).not.toHaveProperty("paddingInner");
    expect(padded.bandwidth()).toBe(0);
    expect(padded.paddingOuter()).toBe(0.25);

    const singleton = create("point").domain(["only"]).padding(0);
    singleton.props = { gapPositions: { expr: "cuts" } };
    expect(singleton("only")).toBe(0.5);
    expect(singleton.copy()("only")).toBe(0.5);
    singleton.domain([]);
    expect(singleton("only")).toBeUndefined();
    expect(singleton.invertRange([0, 1])).toBeUndefined();
});

test("reactive empty gaps retain native geometry, while exhausted placements recover", () => {
    const scale = create().domain([false, true]).gapPositions([1]).gapWidth(40);
    scale.props = { gapPositions: { expr: "cuts" } };
    scale.axisLength(40);
    expect(scale.gapMapping().fits).toBe(false);
    expect(scale(false)).toBeNaN();
    expect(scale.bandwidth()).toBe(0);
    expect(scale.invert(0.5)).toBeUndefined();
    expect(scale.gapMapping(0).fits).toBe(false);

    scale.axisLength(80);
    expect(scale.gapMapping().fits).toBe(true);
    expect(scale(true) * 80).toBe(60);
    scale.gapPositions([]).gapWidth(0);
    expect(scale.gapMapping().fits).toBe(true);
    expect(scale(false)).toBe(0);
    expect(scale(true)).toBe(0.5);

    scale.props = { gapPositions: [], gapWidth: 0 };
    scale.axisLength(() => {
        throw new Error("Disabled gaps must not request positional geometry.");
    });
    expect(scale.gapMapping()).toBeUndefined();
    expect(scale(false)).toBe(0);
    expect(scale.bandwidth()).toBe(0.5);
});

test("viewports navigate numeric categories without changing membership and copy independently", () => {
    const scale = create()
        .domain([10, 20, 30, 40])
        .range([100, 0])
        .viewport({ interval: [1, 3] });
    expect(scale.domain()).toEqual([10, 20, 30, 40]);
    expect(scale(20)).toBe(50);
    expect(scale(30)).toBe(0);
    expect(scale.invert(75)).toBe(20);
    expect(scale.invertRange([0.001, 99.999])).toEqual([20, 30]);

    const copy = scale.copy();
    const snapshot = scale.viewport();
    snapshot.interval[0] = 0;
    expect(scale.viewport().interval).toEqual([1, 3]);
    scale.domain([10, 20, 30, 40, 50]);
    expect(scale(20)).toBe(50);
    scale.viewport(null);
    expect(scale.step()).toBe(20);
    expect(copy.step()).toBe(50);
    expect(() => copy.round(true)).toThrow("round");

    const point = create("point")
        .domain(["A", "B", "C", "D"])
        .viewport({ interval: [1, 3] });
    expect(point("B")).toBe(0);
    expect(point("C")).toBe(1);
    expect(point.bandwidth()).toBe(0);
    expect(point.copy().viewport()).toEqual(point.viewport());
});

test("categorical navigation retains pointer anchors and fixed partially visible gaps", () => {
    const scale = create()
        .domain(["A", "B", "C", "D"])
        .gapPositions([2])
        .gapWidth(8)
        .axisLength(88);
    const mapping = scale.navigationMapping();
    const anchor = 0.5;
    const before = mapping.invertPoint(anchor);
    const next = mapping.navigate(0.5, anchor, 0);
    scale.viewport({
        interval: /** @type {[number, number]} */ (next.domain),
        gapRanks: /** @type {[number, number]} */ (next.ranks),
    });
    expect(scale.navigationMapping().invertPoint(anchor).value).toBe(
        before.value
    );
    expect(scale.navigationMapping().invertPoint(anchor).rank).toBeCloseTo(
        before.rank
    );
    expect(scale("C") - scale.gapMapping().position("B", 1)).toBeCloseTo(
        8 / 88
    );
    expect(scale.invert(anchor)).toBeUndefined();
    expect(
        scale.copy().navigationMapping().invertPoint(anchor).rank
    ).toBeCloseTo(before.rank);
    expect(scale.domain()).toEqual(["A", "B", "C", "D"]);
    expect(() => scale.viewport({ interval: [2, 1] })).toThrow("viewport");
});
