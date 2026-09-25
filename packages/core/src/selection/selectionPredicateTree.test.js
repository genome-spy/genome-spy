import { describe, expect, test } from "vitest";
import endpointBrushes from "../../../../examples/docs/grammar/conditional-encoding/endpoint-brushes.json" with { type: "json" };
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import View from "../view/view.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize } from "../view/testUtils.js";
import Rectangle from "../view/layout/rectangle.js";
import { createWebGpuMarkConfig } from "../rendering/webgpu/webGpuMarkAdapter.js";
import {
    activeMatchResolvedSelectionPredicate,
    compileSelectionPredicateTree,
    getSelectionPredicateTreeParams,
    normalizeSelectionPredicateTree,
    resolveSelectionPredicateTree,
    selectionPredicateMatchesWhenEmpty,
} from "./selectionPredicateTree.js";

const encoding = /** @type {import("../spec/channel.js").Encoding} */ ({
    x: { field: "source", type: "index" },
    x2: { field: "target" },
    color: { value: "gray" },
});

/** @param {Record<string, any>} values */
function runtime(values) {
    return {
        findValue: (/** @type {string} */ name) => values[name],
        findSelectionCapability: (/** @type {string} */ name) =>
            name === "hover"
                ? {
                      type: /** @type {const} */ ("single"),
                      components: /** @type {{component: string}[]} */ ([]),
                  }
                : {
                      type: /** @type {const} */ ("interval"),
                      components: [
                          {
                              component: "x",
                              type: /** @type {const} */ ("index"),
                          },
                      ],
                  },
    };
}

/** @param {string} name */
const interval = (name) => ({
    type: /** @type {const} */ ("interval"),
    intervals: { x: /** @type {[number, number] | null} */ (null) },
    name,
});

describe("logical selection predicates", () => {
    test("public endpoint example combines brushes and restores links on clear", async () => {
        const root = await createAndInitialize(
            /** @type {any} */ (endpointBrushes),
            View
        );
        /** @type {UnitView | undefined} */
        let links;
        root.visit((view) => {
            if (view instanceof UnitView && view.name === "links") {
                links = view;
            }
        });
        expect(links).toBeDefined();
        expect(
            root.paramRuntime.findSelectionCapability("targetBrush")
        ).toMatchObject({
            type: "interval",
            components: [{ component: "x", type: "index" }],
        });
        const rows = links.getCollector().facetBatches.get(undefined);
        const color = links.mark.encoders.color.branches[0].predicate;
        const translated = createWebGpuMarkConfig(
            links.mark,
            {},
            Rectangle.create(0, 0, 400, 110)
        );
        if (!translated) {
            throw new Error("Expected the link mark to translate to WebGPU.");
        }
        expect(translated.definition.type).toBe("link");
        expect(
            /** @type {any} */ (translated.config).channels.color.conditions[0]
                .when
        ).toMatchObject({
            all: [
                {
                    selection: "targetBrush",
                    projections: [{ input: "x2" }],
                },
                {
                    selection: "sourceBrush",
                    projections: [{ input: "x" }],
                },
            ],
        });
        const selectedSources = (/** @type {(datum: any) => boolean} */ test) =>
            rows.filter(test).map((row) => row.source);

        expect(selectedSources(color)).toEqual([80, 230, 380, 530, 680, 830]);
        root.paramRuntime.setValue("targetBrush", {
            type: "interval",
            intervals: { x: [200, 650] },
        });
        expect(selectedSources(color)).toEqual([230, 530, 680]);
        root.paramRuntime.setValue("sourceBrush", {
            type: "interval",
            intervals: { x: [350, 750] },
        });
        expect(selectedSources(color)).toEqual([530, 680]);
        root.paramRuntime.setValue("targetBrush", {
            type: "interval",
            intervals: { x: null },
        });
        expect(selectedSources(color)).toEqual([380, 530, 680]);
        root.paramRuntime.setValue("sourceBrush", {
            type: "interval",
            intervals: { x: null },
        });
        expect(selectedSources(color)).toEqual([80, 230, 380, 530, 680, 830]);
    });

    test("fitted text selects the first index but excludes the upper edge", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [{ pos: 6 }, { pos: 7 }, { pos: 12 }, { pos: 13 }],
                },
                params: [
                    {
                        name: "brush",
                        select: { type: "interval", encodings: ["x"] },
                    },
                ],
                mark: { type: "text", fitToBand: true },
                encoding: {
                    x: { field: "pos", type: "index" },
                    text: { field: "pos" },
                    color: {
                        condition: { param: "brush", value: "red" },
                        value: "gray",
                    },
                },
            },
            UnitView
        );
        const predicate = view.mark.encoders.color.branches[0].predicate;
        const rows = view.getCollector().facetBatches.get(undefined);

        view.paramRuntime.setValue("brush", {
            type: "interval",
            intervals: { x: [7, 13] },
        });
        expect(rows.filter(predicate).map((row) => row.pos)).toEqual([7, 12]);
    });

    test("ranged interval membership uses half-open boundaries", () => {
        const values = { brush: interval("brush") };
        values.brush.intervals.x = [6, 11];
        const tree = normalizeSelectionPredicateTree({
            param: "brush",
            empty: false,
        });
        /** @param {"intersects" | "encloses" | "endpoints"} mode */
        const matches = (mode) =>
            compileSelectionPredicateTree(
                resolveSelectionPredicateTree(
                    tree,
                    encoding,
                    runtime(values),
                    mode,
                    () => "index"
                ),
                () => values.brush
            );

        expect(matches("intersects")({ source: 4, target: 6 })).toBe(false);
        expect(matches("intersects")({ source: 10, target: 11 })).toBe(true);
        expect(matches("intersects")({ source: 11, target: 13 })).toBe(false);
        expect(matches("intersects")({ source: 12, target: 10 })).toBe(true);
        expect(matches("encloses")({ source: 11, target: 6 })).toBe(true);
        expect(matches("endpoints")({ source: 11, target: 13 })).toBe(false);
        expect(matches("endpoints")({ source: 10, target: 11 })).toBe(true);
    });

    test("normalizes nested nodes and rejects mixed or empty operators", () => {
        const tree = normalizeSelectionPredicateTree(
            /** @type {any} */ ({
                test: {
                    or: [
                        { param: "hover", empty: false },
                        {
                            not: {
                                and: [{ param: "access" }, { param: "score" }],
                            },
                        },
                    ],
                },
            })
        );
        expect(getSelectionPredicateTreeParams(tree)).toEqual([
            "hover",
            "access",
            "score",
        ]);
        expect(selectionPredicateMatchesWhenEmpty(tree)).toBe(false);
        expect(() =>
            normalizeSelectionPredicateTree(
                /** @type {any} */ ({ test: { and: [] } })
            )
        ).toThrow(/nonempty/);
        expect(() =>
            normalizeSelectionPredicateTree(
                /** @type {any} */ ({
                    test: { and: [{ param: "a" }], or: [{ param: "b" }] },
                })
            )
        ).toThrow(/exactly one operator/);
        expect(() =>
            normalizeSelectionPredicateTree(
                /** @type {any} */ ({
                    test: { not: { param: "a" }, empty: true },
                })
            )
        ).toThrow(/cannot be mixed/);
    });

    test("tests two brushes against separate link endpoints with hover OR", () => {
        /** @type {Record<string, any>} */
        const values = {
            access: interval("access"),
            score: interval("score"),
            hover: { type: "single", uniqueId: null },
        };
        const tree = normalizeSelectionPredicateTree(
            /** @type {any} */ ({
                test: {
                    or: [
                        { param: "hover", empty: false },
                        {
                            and: [
                                { param: "access", project: { x: "x2" } },
                                { param: "score", project: { x: "x" } },
                            ],
                        },
                    ],
                },
            })
        );
        const resolved = resolveSelectionPredicateTree(
            tree,
            encoding,
            runtime(values),
            "endpoints",
            () => "index"
        );
        const matches = compileSelectionPredicateTree(
            resolved,
            (name) => values[name]
        );
        const row = { source: 15, target: 25, [UNIQUE_ID_KEY]: 7 };

        expect(matches(row)).toBe(true);
        values.access.intervals.x = [20, 30];
        expect(matches(row)).toBe(true);
        values.score.intervals.x = [10, 20];
        expect(matches(row)).toBe(true);
        values.access.intervals.x = [40, 50];
        expect(matches(row)).toBe(false);
        values.hover.uniqueId = 7;
        expect(matches(row)).toBe(true);
    });

    test("flat union keeps group-empty and partial interval behavior", () => {
        /** @type {Record<string, any>} */
        const values = {
            first: { type: "single", uniqueId: null },
            second: { type: "single", uniqueId: null },
        };
        const tree = normalizeSelectionPredicateTree(
            /** @type {any} */ ({
                test: { param: { or: ["first", "second"] }, empty: true },
            })
        );
        const resolved = resolveSelectionPredicateTree(
            tree,
            encoding,
            {
                findValue: (name) => values[name],
            },
            "intersects"
        );
        const matches = compileSelectionPredicateTree(
            resolved,
            (name) => values[name]
        );
        const row = { [UNIQUE_ID_KEY]: 4 };
        expect(matches(row)).toBe(true);
        values.first.uniqueId = 3;
        expect(matches(row)).toBe(false);
        values.second.uniqueId = 4;
        expect(matches(row)).toBe(true);
    });

    test("active-match guards the entire conjunction and preserves not", () => {
        const values = /** @type {Record<string, any>} */ ({
            access: interval("access"),
            score: interval("score"),
            hover: { type: "single", uniqueId: null },
        });
        const resolve = (/** @type {any} */ test) =>
            resolveSelectionPredicateTree(
                normalizeSelectionPredicateTree({ test }),
                encoding,
                runtime(values),
                "intersects",
                () => "index"
            );
        const conjunction = resolve({
            and: [
                { param: "access", project: { x: "x2" } },
                { param: "score", project: { x: "x" } },
            ],
        });
        const activeMatch = compileSelectionPredicateTree(
            activeMatchResolvedSelectionPredicate(conjunction),
            (name) => values[name]
        );
        const row = { source: 15, target: 25, [UNIQUE_ID_KEY]: 7 };
        expect(activeMatch(row)).toBe(false);
        values.access.intervals.x = [20, 30];
        expect(activeMatch(row)).toBe(true);
        values.score.intervals.x = [40, 50];
        expect(activeMatch(row)).toBe(false);

        const notHover = compileSelectionPredicateTree(
            activeMatchResolvedSelectionPredicate(
                resolve({ not: { param: "hover", empty: false } })
            ),
            (name) => values[name]
        );
        expect(notHover(row)).toBe(false);
        values.hover.uniqueId = 8;
        expect(notHover(row)).toBe(true);
        values.hover.uniqueId = 7;
        expect(notHover(row)).toBe(false);
    });

    test("rejects invalid projections before evaluation", () => {
        const values = { brush: interval("brush") };
        const resolve = (
            /** @type {any} */ condition,
            /** @type {any} */ targetEncoding = encoding,
            /** @type {any} */ targetType = "index"
        ) =>
            resolveSelectionPredicateTree(
                normalizeSelectionPredicateTree(condition),
                targetEncoding,
                runtime(values),
                "intersects",
                () => targetType
            );
        expect(() =>
            resolve({ test: { param: "brush", project: { x: "x2" } } })
        ).not.toThrow();
        expect(() =>
            resolve({ test: { param: "brush", project: { y: "y" } } })
        ).toThrow(/cover/);
        expect(() =>
            resolve({ test: { param: "brush", project: { x: "y" } } })
        ).toThrow(/Invalid interval/);
        expect(() =>
            resolve(
                { test: { param: "brush", project: { x: "x2" } } },
                encoding,
                "locus"
            )
        ).toThrow(/matching/);
        expect(() =>
            resolve(
                { test: { param: "brush", project: { x: "x2" } } },
                encoding,
                "nominal"
            )
        ).toThrow(/matching/);
        expect(() =>
            resolve(
                { test: { param: "brush", project: { x: "x2" } } },
                encoding,
                "ordinal"
            )
        ).toThrow(/matching/);
        expect(() =>
            resolve(
                { test: { param: "brush", project: { x: "x2" } } },
                { ...encoding, x2: undefined }
            )
        ).toThrow(/unconditional field/);
        expect(() =>
            resolve(
                { test: { param: "brush", project: { x: "x2" } } },
                { ...encoding, x2: { value: 2 } }
            )
        ).toThrow(/unconditional field/);
        const pointValues = /** @type {Record<string, any>} */ ({
            hover: { type: "single", uniqueId: null },
        });
        expect(() =>
            resolveSelectionPredicateTree(
                normalizeSelectionPredicateTree({
                    param: "hover",
                    project: { x: "x2" },
                }),
                encoding,
                runtime(pointValues),
                "intersects",
                () => "index"
            )
        ).toThrow(/not an interval/);
    });

    test.each(["quantitative", "index", "locus"])(
        "accepts a matching %s endpoint with inherited secondary type",
        (type) => {
            const sourceType =
                /** @type {import("../spec/channel.js").Type} */ (type);
            const tree = normalizeSelectionPredicateTree({
                param: "brush",
                project: { x: "x2" },
            });
            const resolved = resolveSelectionPredicateTree(
                tree,
                {
                    x: { field: "start", type: sourceType },
                    x2: { field: "end" },
                },
                {
                    findValue: () => interval("brush"),
                    findSelectionCapability: () => ({
                        type: "interval",
                        components: [{ component: "x", type: sourceType }],
                    }),
                },
                "intersects",
                (channel) => (channel === "x" ? sourceType : undefined)
            );
            const matches = compileSelectionPredicateTree(resolved, () => ({
                type: "interval",
                intervals: { x: [20, 30] },
            }));
            expect(matches({ start: 5, end: 25 })).toBe(true);
            expect(matches({ start: 25, end: 5 })).toBe(false);
        }
    );

    test("treats a partially active two-axis brush as empty", () => {
        /** @type {{brush: import("../types/selectionTypes.js").IntervalSelection}} */
        const values = {
            brush: {
                type: "interval",
                intervals: { x: [10, 20], y: null },
            },
        };
        const resolve = (/** @type {boolean} */ empty) =>
            resolveSelectionPredicateTree(
                normalizeSelectionPredicateTree({ param: "brush", empty }),
                {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
                {
                    findValue: () => values.brush,
                    findSelectionCapability: () => ({
                        type: "interval",
                        components: [
                            { component: "x", type: "quantitative" },
                            { component: "y", type: "quantitative" },
                        ],
                    }),
                },
                "intersects"
            );
        const matches = compileSelectionPredicateTree(
            resolve(true),
            () => values.brush
        );
        const matchesNonempty = compileSelectionPredicateTree(
            resolve(false),
            () => values.brush
        );
        const activeMatch = compileSelectionPredicateTree(
            activeMatchResolvedSelectionPredicate(resolve(true)),
            () => values.brush
        );
        expect(matches({ x: 15, y: 100 })).toBe(true);
        expect(matches({ x: 25, y: 100 })).toBe(true);
        expect(matchesNonempty({ x: 15, y: 100 })).toBe(false);
        expect(activeMatch({ x: 15, y: 100 })).toBe(false);

        values.brush.intervals.y = [90, 110];
        expect(matches({ x: 15, y: 100 })).toBe(true);
        expect(matchesNonempty({ x: 15, y: 100 })).toBe(true);
        expect(activeMatch({ x: 15, y: 100 })).toBe(true);
        expect(matches({ x: 25, y: 100 })).toBe(false);
    });
});
