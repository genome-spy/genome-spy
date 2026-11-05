import { describe, expect, test, vi } from "vitest";
import {
    buildMarkXIndex,
    createMarkXIndexSpec,
    getMarkXIndexScaleResolution,
    resolveMarkXIndexQuery,
} from "./markXIndex.js";

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
        properties: { clamp: false },
        encoders: {
            x: createEncoder("x", scale),
        },
        getType: () => type,
        unitView: {
            getScaleResolution: vi.fn(() => resolution),
        },
    };
    return { mark, resolution, scale };
}

describe("buildMarkXIndex", () => {
    test.each(["point", "rect"])(
        "preserves conservative %s ranges for a large batch",
        (type) => {
            const { mark, scale } = createFixture(type);
            if (type === "rect") {
                mark.encoders.x2 = createEncoder("x2", scale);
            }
            const count = 20000;
            const offset = 123;
            const data = Array.from({ length: count }, (_, i) => ({
                x: (i / count) * 100,
                x2: (i / count) * 100 + 2,
            }));
            const spec = createMarkXIndexSpec(mark);
            const lookup = buildMarkXIndex(spec, data, offset);
            const [start, end] = lookup(40, 50);
            // A range lookup may include neighboring bins, but must include every hit.
            const firstHit = data.findIndex(
                (d) => (type === "rect" ? d.x2 : d.x) >= 40
            );
            const afterLastHit = data.findIndex((d) => d.x >= 50);
            expect(start).toBeGreaterThanOrEqual(offset);
            expect(start).toBeLessThanOrEqual(offset + firstHit);
            expect(end).toBeGreaterThanOrEqual(offset + afterLastHit);
            expect(end).toBeLessThanOrEqual(offset + count);

            data.at(-1).x = -1;
            expect(buildMarkXIndex(spec, data, offset)).toBeUndefined();
        }
    );
});

describe("createMarkXIndexSpec", () => {
    test("captures eligible raw accessors and a stable zoom extent", () => {
        const { mark } = createFixture();
        const spec = createMarkXIndexSpec(mark);

        expect(spec.xAccessor({ x: 12 })).toBe(12);
        expect(spec.x2Accessor).toBeUndefined();
        expect(spec.indexDomain).toEqual([0, 100]);
    });

    test.each(["rect", "rule", "tick", "text", "arrow"])(
        "accepts compatible %s endpoint ranges",
        (type) => {
            const { mark, scale } = createFixture(type);
            mark.encoders.x2 = createEncoder("x2", scale);
            if (["rect", "rule", "tick"].includes(type))
                mark.properties.clamp = "x";

            const spec = createMarkXIndexSpec(mark);
            expect(spec.x2Accessor({ x2: 23 })).toBe(23);
        }
    );

    test.each(["point", "text", "arrow", "link"])(
        "keeps offscreen %s rows available when x anchors are clamped",
        (type) => {
            const { mark } = createFixture(type);
            if (type === "link") mark.properties.linkShape = "line";
            mark.properties.clamp = "x";
            expect(createMarkXIndexSpec(mark)).toBeUndefined();

            mark.properties.clamp = "y";
            expect(createMarkXIndexSpec(mark)).toBeDefined();
        }
    );

    test("only indexes links with literal endpoint-bounded shapes", () => {
        const { mark, resolution } = createFixture("link");
        expect(getMarkXIndexScaleResolution(mark)).toBeUndefined();
        for (const shape of ["line", "diagonal", "orthogonal", "dome"]) {
            mark.properties.linkShape = shape;
            expect(getMarkXIndexScaleResolution(mark)).toBe(resolution);
            expect(createMarkXIndexSpec(mark)).toBeDefined();
        }
        for (const shape of ["arc", { expr: "shape" }]) {
            mark.properties.linkShape = shape;
            expect(getMarkXIndexScaleResolution(mark)).toBeUndefined();
        }
    });

    test("skips scale resolution when indexing is disabled", () => {
        const { mark } = createFixture();
        mark.encoders.x.channelDef.buildIndex = false;

        expect(getMarkXIndexScaleResolution(mark)).toBeUndefined();
        expect(mark.unitView.getScaleResolution).not.toHaveBeenCalled();
    });

    test("keeps the scale dependency while an extent becomes valid", () => {
        const { mark, resolution } = createFixture();
        resolution.zoomExtent = [0, 0];
        expect(getMarkXIndexScaleResolution(mark)).toBe(resolution);
        expect(createMarkXIndexSpec(mark)).toBeUndefined();

        resolution.zoomExtent = [0, 100];
        expect(createMarkXIndexSpec(mark).indexDomain).toEqual([0, 100]);
    });

    const ineligibleCases = /** @type {[string, (fixture: any) => void][]} */ ([
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
