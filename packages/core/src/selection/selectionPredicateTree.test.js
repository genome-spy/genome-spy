import { describe, expect, test } from "vitest";
import endpointBrushes from "../../../../examples/docs/grammar/conditional-encoding/endpoint-brushes.json" with { type: "json" };
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import View from "../view/view.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize } from "../view/testUtils.js";
import Rectangle from "../view/layout/rectangle.js";
import { createWebGpuMarkConfig } from "../rendering/webgpu/webGpuMarkAdapter.js";
import { createSinglePointSelection } from "./selection.js";
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
    type: "interval",
    intervals: { x: /** @type {[number, number] | null} */ (null) },
    name,
});

describe("logical selection predicates", () => {
    test("public endpoint example covers both brushes, clearing, and hover", async () => {
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
        const rows = links.getCollector().facetBatches.get(undefined);
        const color = links.mark.encoders.color.branches[0].predicate;
        const opacity = links.mark.encoders.opacity.branches[0].predicate;
        const order = links.mark.getOrder().predicate;
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
            any: [
                { selection: "hover" },
                {
                    all: [
                        {
                            selection: "sourceBrush",
                            projections: [{ input: "x" }],
                        },
                        {
                            selection: "targetBrush",
                            projections: [{ input: "x2" }],
                        },
                    ],
                },
            ],
        });
        const selectedSources = (/** @type {(datum: any) => boolean} */ test) =>
            rows.filter(test).map((row) => row.source);

        expect(selectedSources(color)).toEqual([10, 20, 30, 40]);
        root.paramRuntime.setValue("sourceBrush", {
            type: "interval",
            intervals: { x: [15, 35] },
        });
        expect(selectedSources(color)).toEqual([20, 30]);
        root.paramRuntime.setValue("targetBrush", {
            type: "interval",
            intervals: { x: [70, 80] },
        });
        expect(selectedSources(color)).toEqual([20]);
        expect(selectedSources(opacity)).toEqual([20]);
        expect(selectedSources(order)).toEqual([20]);

        root.paramRuntime.setValue(
            "hover",
            createSinglePointSelection(rows[3])
        );
        expect(selectedSources(color)).toEqual([20, 40]);
        expect(selectedSources(order)).toEqual([20, 40]);
        expect(selectedSources(opacity)).toEqual([20]);

        root.paramRuntime.setValue("hover", createSinglePointSelection(null));
        root.paramRuntime.setValue("sourceBrush", {
            type: "interval",
            intervals: { x: null },
        });
        expect(selectedSources(color)).toEqual([20]);
        root.paramRuntime.setValue("targetBrush", {
            type: "interval",
            intervals: { x: null },
        });
        expect(selectedSources(color)).toEqual([10, 20, 30, 40]);
    });

    test("resolves sibling pushed brushes through their parent's value slots", async () => {
        const spec = /** @type {any} */ ({
            data: { values: [{ source: 15, target: 25, y: 1 }] },
            params: [
                { name: "access", value: null },
                { name: "score", value: null },
            ],
            layer: [
                {
                    name: "links",
                    mark: "link",
                    encoding: {
                        x: { field: "source", type: "index" },
                        x2: { field: "target" },
                        y: { field: "y", type: "quantitative" },
                        opacity: {
                            condition: {
                                test: {
                                    and: [
                                        {
                                            param: "access",
                                            project: { x: "x2" },
                                        },
                                        { param: "score", project: { x: "x" } },
                                    ],
                                },
                                value: 1,
                            },
                            value: 0.2,
                        },
                    },
                },
                {
                    name: "accessBrush",
                    params: [
                        {
                            name: "access",
                            push: "outer",
                            select: { type: "interval", encodings: ["x"] },
                        },
                    ],
                    mark: "point",
                    encoding: { x: { field: "target", type: "index" } },
                },
                {
                    name: "scoreBrush",
                    params: [
                        {
                            name: "score",
                            push: "outer",
                            select: { type: "interval", encodings: ["x"] },
                        },
                    ],
                    mark: "point",
                    encoding: { x: { field: "source", type: "index" } },
                },
            ],
        });
        const root = await createAndInitialize(spec, View);
        /** @type {UnitView | undefined} */
        let links;
        root.visit((view) => {
            if (view instanceof UnitView && view.name === "links") {
                links = view;
            }
        });
        expect(links).toBeDefined();
        expect(
            root.paramRuntime.findSelectionCapability("access")
        ).toMatchObject({
            type: "interval",
            components: [{ component: "x", type: "index" }],
        });
        expect(
            getSelectionPredicateTreeParams(
                links.mark.encoders.opacity.branches[0].predicate.selection
            )
        ).toEqual(["access", "score"]);
        const predicate = links.mark.encoders.opacity.branches[0].predicate;
        const row = { source: 15, target: 25, y: 1 };
        expect(predicate(row)).toBe(true);
        root.paramRuntime.setValue("access", {
            type: "interval",
            intervals: { x: [20, 30] },
        });
        expect(predicate(row)).toBe(true);
        root.paramRuntime.setValue("score", {
            type: "interval",
            intervals: { x: [10, 20] },
        });
        expect(predicate(row)).toBe(true);
        root.paramRuntime.setValue("access", {
            type: "interval",
            intervals: { x: [40, 50] },
        });
        expect(predicate(row)).toBe(false);
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
        expect(Object.isFrozen(tree)).toBe(true);
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

    test("ignores an inactive dimension while testing an active one", () => {
        /** @type {{brush: import("../types/selectionTypes.js").IntervalSelection}} */
        const values = {
            brush: {
                type: "interval",
                intervals: { x: [10, 20], y: null },
            },
        };
        const tree = normalizeSelectionPredicateTree({ param: "brush" });
        const resolved = resolveSelectionPredicateTree(
            tree,
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
            resolved,
            () => values.brush
        );
        expect(matches({ x: 15, y: 100 })).toBe(true);
        expect(matches({ x: 25, y: 100 })).toBe(false);
        values.brush.intervals.x = null;
        expect(matches({ x: 25, y: 100 })).toBe(true);
    });
});
