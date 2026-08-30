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
    });
    const resolution = {
        getScale: vi.fn(() => scale),
        zoomExtent: [0, 100],
    };
    const mark = {
        encoders: {
            x: createEncoder("x", scale),
        },
        getType: () => type,
        unitView: {
            getScaleResolution: () => resolution,
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
            "unsupported mark",
            (fixture) => (fixture.mark.getType = () => "text"),
        ],
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
    test("expands a query by one live viewport", () => {
        const { mark } = createFixture();
        const spec = createMarkXIndexSpec(mark);
        const target = /** @type {[number, number]} */ ([0, 0]);

        expect(resolveMarkXIndexQuery(spec, target)).toBe(true);
        expect(target).toEqual([0, 60]);
    });

    test("fails closed for an invalid domain", () => {
        const fixture = createFixture();
        fixture.scale.domain.mockReturnValue([40, 20]);
        const spec = createMarkXIndexSpec(fixture.mark);
        expect(
            resolveMarkXIndexQuery(
                spec,
                /** @type {[number, number]} */ ([0, 0])
            )
        ).toBe(false);
    });
});
