import { describe, expect, test, vi } from "vitest";
import { createMarkXIndexSpec, resolveMarkXIndexQuery } from "./markXIndex.js";

/** @param {string} field */
function createAccessor(field) {
    /** @param {Record<string, any>} datum */
    const accessor = (datum) => datum[field];
    return Object.assign(accessor, {
        asNumberAccessor: () => accessor,
        channel: "x",
        channelDef: { field },
        constant: false,
        fields: [field],
    });
}

/** @param {string} field @param {any} scale @param {object} [channelDef] */
function createEncoder(field, scale, channelDef = {}) {
    const accessor = createAccessor(field);
    return Object.assign(
        (/** @type {Record<string, any>} */ datum) => scale(accessor(datum)),
        {
            branches: [{ accessor, predicate: () => true }],
            channelDef: { field, buildIndex: true, ...channelDef },
            constant: false,
            scale,
        }
    );
}

/** @param {any} value */
function constantEncoder(value) {
    return Object.assign(() => value, {
        branches: [],
        channelDef: { value },
        constant: true,
    });
}

/** @param {string} [type] @returns {any} */
function createFixture(type = "point") {
    const scale = Object.assign((/** @type {number} */ value) => value, {
        type: "linear",
        domain: vi.fn(() => [20, 40]),
        range: vi.fn(() => [0, 1]),
    });
    const resolution = {
        getAxisLength: vi.fn(() => 200),
        getScale: vi.fn(() => scale),
        zoomExtent: [0, 100],
    };
    const mark = {
        encoders: {
            size: constantEncoder(100),
            strokeWidth: constantEncoder(2),
            x: createEncoder("x", scale),
        },
        getType: () => type,
        properties: { minPickingSize: 4, minWidth: 6 },
        unitView: {
            getScaleResolution: () => resolution,
            paramRuntime: { evaluateAndGet: vi.fn() },
        },
    };
    return { mark, resolution, scale };
}

describe("createMarkXIndexSpec", () => {
    test("captures eligible raw accessors and a stable zoom extent", () => {
        const { mark } = createFixture();
        const spec = createMarkXIndexSpec(mark);

        expect(spec.xAccessor({ x: 12 })).toBe(12);
        expect(spec.x2Accessor).toBeUndefined();
        expect(spec.indexDomain).toEqual([0, 100]);
        expect(Object.isFrozen(spec)).toBe(true);
        expect(Object.isFrozen(spec.indexDomain)).toBe(true);
    });

    test("accepts a compatible ranged accessor", () => {
        const { mark, scale } = createFixture("rect");
        mark.encoders.x2 = createEncoder("x2", scale);

        const spec = createMarkXIndexSpec(mark);
        expect(spec.x2Accessor({ x2: 23 })).toBe(23);
    });

    const ineligibleCases = /** @type {[string, (fixture: any) => void][]} */ ([
        [
            "disabled indexing",
            (fixture) =>
                (fixture.mark.encoders.x.channelDef.buildIndex = false),
        ],
        [
            "unbounded zoom",
            (fixture) =>
                (fixture.resolution.zoomExtent = [-Infinity, Infinity]),
        ],
        ["discrete scale", (fixture) => (fixture.scale.type = "band")],
        [
            "conditional x",
            (fixture) =>
                fixture.mark.encoders.x.branches.push(
                    fixture.mark.encoders.x.branches[0]
                ),
        ],
        [
            "constant x",
            (fixture) => (fixture.mark.encoders.x = constantEncoder(5)),
        ],
        [
            "incompatible x2 scale",
            (fixture) =>
                (fixture.mark.encoders.x2 = createEncoder("x2", {
                    ...fixture.scale,
                })),
        ],
    ]);

    test.each(ineligibleCases)("rejects %s", (_name, mutate) => {
        const fixture = createFixture("rect");
        mutate(fixture);
        expect(createMarkXIndexSpec(fixture.mark)).toBeUndefined();
    });

    test("adjusts index-like domain starts", () => {
        const { mark, scale } = createFixture();
        scale.type = "locus";
        expect(createMarkXIndexSpec(mark).domainStartOffset).toBe(-1);
    });
});

describe("resolveMarkXIndexQuery", () => {
    test("expands a point query for offsets, rotated geometry, and picking", () => {
        const { mark } = createFixture();
        mark.encoders.dx = constantEncoder(-3);
        const spec = createMarkXIndexSpec(mark);
        const target = /** @type {[number, number]} */ ([0, 0]);

        expect(resolveMarkXIndexQuery(mark, spec, target)).toBe(true);
        const envelope = 3 + (Math.sqrt(100) / 2) * Math.SQRT2 + 1;
        expect(target).toEqual([
            20 - (20 * envelope) / 200,
            40 + (20 * envelope) / 200,
        ]);
    });

    test("expands rectangles for minimum width, stroke, and shadow", () => {
        const { mark } = createFixture("rect");
        mark.properties.shadowBlur = 3;
        mark.properties.shadowOffsetX = -2;
        const spec = createMarkXIndexSpec(mark);
        const target = /** @type {[number, number]} */ ([0, 0]);

        expect(resolveMarkXIndexQuery(mark, spec, target)).toBe(true);
        const envelope = 3 + 2 + 2 + 3;
        expect(target).toEqual([
            20 - (20 * envelope) / 200,
            40 + (20 * envelope) / 200,
        ]);
    });

    test("fails closed for data-dependent unscaled geometry", () => {
        const { mark } = createFixture();
        mark.encoders.dx = Object.assign(
            (/** @type {{dx: number}} */ datum) => datum.dx,
            {
                branches: [],
                channelDef: { field: "dx" },
                constant: false,
            }
        );
        const spec = createMarkXIndexSpec(mark);

        expect(
            resolveMarkXIndexQuery(
                mark,
                spec,
                /** @type {[number, number]} */ ([0, 0])
            )
        ).toBe(false);
    });

    const fallbackCases = /** @type {[string, (fixture: any) => void][]} */ ([
        [
            "unsupported mark",
            (fixture) => (fixture.mark.getType = () => "text"),
        ],
        [
            "invalid domain",
            (fixture) => fixture.scale.domain.mockReturnValue([40, 20]),
        ],
        [
            "invalid axis length",
            (fixture) => fixture.resolution.getAxisLength.mockReturnValue(0),
        ],
    ]);

    test.each(fallbackCases)("fails closed for %s", (_name, mutate) => {
        const fixture = createFixture();
        mutate(fixture);
        const spec = createMarkXIndexSpec(fixture.mark);
        expect(
            resolveMarkXIndexQuery(
                fixture.mark,
                spec,
                /** @type {[number, number]} */ ([0, 0])
            )
        ).toBe(false);
    });
});
