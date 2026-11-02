import { expect, test } from "vitest";
import { scale as vegaScale } from "vega-scale";
import scaleBand from "./scaleBand.js";

/** @param {"band" | "point"} [type] */
const create = (type = "band") =>
    scaleBand(/** @type {any} */ (vegaScale)(type));

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
    const scale = create().domain(["A", "B", "C", "D"]).range([1, 0]);
    scale.paddingInner(0.2).paddingOuter(0.3).align(0.1);
    scale.gapPositions([2]).gapWidth(8);

    for (const extent of [100, 200]) {
        const mapping = scale.gapMapping(extent);
        expect(mapping.position("B") - mapping.position("C")).toBeCloseTo(
            mapping.step + 8 / extent
        );
        expect(mapping.position("C") - mapping.position("D")).toBeCloseTo(
            mapping.step
        );
        expect(mapping.position("B", 0.5) - mapping.position("B")).toBeCloseTo(
            mapping.bandwidth / 2
        );
        expect(mapping.invertRange([0, 1])).toEqual(["A", "B", "C", "D"]);
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
        0, 20, 48, 68,
    ]);
    expect(scale.bandwidth()).toBe(0);
    expect(scale.invert(48 / 68)).toBe("C");
    expect(scale.invert(44 / 68)).toBeUndefined();

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
